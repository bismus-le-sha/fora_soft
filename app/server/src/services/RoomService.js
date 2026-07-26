/**
 * RoomService — бизнес-логика комнаты: join/leave/chat/media/signal.
 *
 * ЗАДАЧА 8 (каркас) наполняется реальным поведением задачами 9–14
 * (join/leave/chat — [critical], test-first). `join` реализован задачей 9
 * (SEC-07); остальные методы остаются СТАБАМИ (см. TODO ниже) до своих задач.
 *
 * Requirements: F-40, SEC-05, SEC-15 (каркас). Полные требования по методам —
 * см. задачи 9–14 в `impl-video-chat-room.md`.
 * Design: §4.1 (таблица `services/RoomService.js`), §5.1, §5.2, §6.1, §7.
 */

import { validateName } from '../lib/validate.js';
import { sanitize } from '../lib/sanitize.js';
import { Participant } from '../domain/Participant.js';
import { createSystemMessage } from '../domain/Message.js';

/** Сообщения `join:rejected` клиенту (SEC-15, без внутренних деталей). */
const JOIN_REJECT_MESSAGES = Object.freeze({
  'invalid-name': 'Некорректное имя.',
  'room-full': 'Комната заполнена.',
});

/**
 * @param {import('socket.io').Socket} socket
 * @param {'invalid-name' | 'room-full'} code
 */
function rejectJoin(socket, code) {
  socket.emit('join:rejected', {
    code,
    message: JOIN_REJECT_MESSAGES[code] ?? 'Не удалось войти в комнату.',
  });
}

/**
 * Атомарный вход в комнату (лимит `ROOM_CAPACITY`, SEC-07). Задача 9 [critical].
 *
 * Rate-limit(join) уже применён вызывающим `socket/handlers.js` до вызова
 * этой функции (Design §6.1). Пайплайн здесь: `validateName` → `sanitize` →
 * атомарный `RoomRegistry.getOrCreate` → **синхронная** секция
 * `room.isFull()` → `room.add()` (без `await` между ними) → `join:ok`
 * инициатору + `participant:joined`/`chat:system{join}` остальным.
 *
 * Инвариант атомарности (SEC-07, Design §4.1): Node.js однопоточен, и весь
 * путь от `socket.onAny` до этой строки — синхронный (без `await`/микротасков),
 * поэтому обработка одного `join` до конца выполняется как одна неделимая
 * критическая секция по отношению к другим `join` того же/другого сокета —
 * гонка «check → reserve» невозможна по конструкции, а не по счастливой
 * случайности тайминга.
 *
 * @param {import('socket.io').Socket} socket
 * @param {{roomId?: unknown, name?: unknown}} payload
 * @param {{io: import('socket.io').Server, config: object, registry: import('../domain/RoomRegistry.js').RoomRegistry}} ctx
 * @returns {void}
 */
export function join(socket, payload, ctx) {
  const { registry, config } = ctx;

  const nameResult = validateName(payload?.name);
  if (!nameResult.ok) {
    rejectJoin(socket, 'invalid-name');
    return;
  }
  // Defense-in-depth (Design §6.1: validateName → sanitize перед использованием),
  // хотя allow-list validateName уже исключает `<`/`>` — не полагаемся на это
  // молчаливо на случай будущих правок allow-list.
  const name = sanitize(nameResult.value);
  if (name.length === 0) {
    rejectJoin(socket, 'invalid-name');
    return;
  }

  const roomId = typeof payload?.roomId === 'string' ? payload.roomId.trim() : '';
  if (roomId.length === 0) {
    // Структурно некорректный roomId — не документированный код join:rejected
    // (контракт §6.2 знает только invalid-name/room-full), поэтому обобщённая
    // ошибка транспортного уровня (SEC-15), без падения процесса (F-40).
    socket.emit('error', { code: 'bad-payload', message: 'Некорректный запрос.' });
    return;
  }

  const getResult = registry.getOrCreate(roomId);
  if (!getResult.ok) {
    // SEC-10: достигнут ROOMS_MAX — отказ без краша, не путать с room-full
    // (лимит участников ОДНОЙ комнаты).
    socket.emit('error', { code: 'server-full', message: 'Сервер перегружен, попробуйте позже.' });
    return;
  }
  const { room } = getResult;

  // --- Атомарная секция (SEC-07): isFull() → add() без await между ними. ---
  if (room.isFull()) {
    rejectJoin(socket, 'room-full');
    return;
  }
  const participant = new Participant({ id: socket.id, name });
  room.add(participant);
  // --- Конец атомарной секции. ---

  socket.join(roomId);
  socket.data.roomId = roomId;

  const snapshot = room.snapshot();
  socket.emit('join:ok', {
    selfId: socket.id,
    participants: snapshot.participants,
    history: snapshot.history,
    iceServers: config.ICE_SERVERS,
  });

  socket.to(roomId).emit('participant:joined', participant.toSnapshot());
  socket.to(roomId).emit('chat:system', createSystemMessage({ event: 'join', subjectName: name }));
}

/**
 * Явный выход из комнаты (`leave`) либо cleanup при обрыве (`disconnect`).
 * Задача 10 [critical], SEC-11.
 * @param {import('socket.io').Socket} socket
 * @param {{io: import('socket.io').Server, config: object, registry: import('../domain/RoomRegistry.js').RoomRegistry}} ctx
 * @returns {void}
 */
export function leave(_socket, _ctx) {
  // TODO(задача 10, critical, SEC-11): room.remove(id) → participant:left +
  // chat:system(leave) остальным; при room.size()==0 → RoomRegistry.delete
  // (участники/история/id стёрты, без утечки состояния).
}

/**
 * Отправка сообщения чата с анти-спуфингом авторства (SEC-06). Задача 11
 * [critical].
 * @param {import('socket.io').Socket} socket
 * @param {{text?: string}} payload
 * @param {{io: import('socket.io').Server, config: object, registry: import('../domain/RoomRegistry.js').RoomRegistry}} ctx
 * @returns {void}
 */
export function postChat(_socket, _payload, _ctx) {
  // TODO(задача 11, critical, SEC-02/03/05/06): validateText → sanitize →
  // Message{kind:chat, authorId=socket.id, authorName=снимок} (поля автора
  // из payload игнорируются) → push в историю (задача 12 — HISTORY_MAX) →
  // broadcast chat:message.
}

/**
 * Обновление статуса mic/cam участника и broadcast. Задача 13.
 * @param {import('socket.io').Socket} socket
 * @param {{audio?: boolean, video?: boolean}} payload
 * @param {{io: import('socket.io').Server, config: object, registry: import('../domain/RoomRegistry.js').RoomRegistry}} ctx
 * @returns {void}
 */
export function setMedia(_socket, _payload, _ctx) {
  // TODO(задача 13): обновить participant.media{audio,video} → broadcast
  // media:state{id,audio,video} остальным участникам комнаты.
}

/**
 * Ретрансляция сигналинга (offer/answer/ice) только адресату внутри той же
 * комнаты; сервер не парсит SDP (SEC-18). Задача 14.
 * @param {import('socket.io').Socket} socket
 * @param {'offer' | 'answer' | 'ice'} kind
 * @param {{to?: string, sdp?: string, candidate?: object}} payload
 * @param {{io: import('socket.io').Server, config: object, registry: import('../domain/RoomRegistry.js').RoomRegistry}} ctx
 * @returns {void}
 */
export function relaySignal(_socket, _kind, _payload, _ctx) {
  // TODO(задача 14, SEC-18): проверить, что `payload.to` — участник той же
  // комнаты → relay `signal:<kind>{from:socket.id, sdp|candidate}` только
  // адресату; `to` вне комнаты — игнорировать. Payload ретранслируется как
  // непрозрачные данные, без парсинга SDP/ICE сервером.
}

export default { join, leave, postChat, setMedia, relaySignal };
