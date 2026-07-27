/**
 * RoomService — бизнес-логика комнаты: join/leave/chat/media/signal.
 *
 * ЗАДАЧА 8 (каркас) наполняется реальным поведением задачами 9–14
 * (join/leave/chat — [critical], test-first). `join`/`leave`/`postChat`/
 * `setMedia` реализованы задачами 9/10/11/13; `relaySignal` остаётся СТАБОМ
 * (см. TODO ниже) до задачи 14.
 *
 * Requirements: F-40, SEC-05, SEC-15 (каркас). Полные требования по методам —
 * см. задачи 9–14 в `impl-video-chat-room.md`.
 * Design: §4.1 (таблица `services/RoomService.js`), §5.1, §5.2, §6.1, §7.
 */

import { validateName, validateText, validateMedia } from '../lib/validate.js';
import { sanitize } from '../lib/sanitize.js';
import { Participant } from '../domain/Participant.js';
import { createSystemMessage, createChatMessage } from '../domain/Message.js';

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
 * Общий `chat:system`-broadcast остальным участникам комнаты (используется
 * и `join()`, и `leave()` — см. Design §6.2/§7.3).
 * @param {import('socket.io').Socket} socket
 * @param {string} roomId
 * @param {'join' | 'leave'} event
 * @param {string} subjectName
 */
function broadcastSystemEvent(socket, roomId, event, subjectName) {
  socket.to(roomId).emit('chat:system', createSystemMessage({ event, subjectName }));
}

/**
 * Резолв `room`/`participant` по уже известному `roomId` (без чтения
 * `socket.data.roomId` — это ответственность вызывающего, см. `resolveSession`
 * ниже и `leave()`, которой нужно прочитать/сбросить `socket.data.roomId` до
 * остальных проверок). Общая часть трёхшагового резолва сессии сокета
 * (post-review находка задачи 11): `registry.get(roomId)` → `room.get(socket.id)`,
 * no-op (`null`) при любом промахе.
 * @param {import('socket.io').Socket} socket
 * @param {import('../domain/RoomRegistry.js').RoomRegistry} registry
 * @param {string} roomId
 * @returns {{room: import('../domain/Room.js').Room, participant: import('../domain/Participant.js').Participant} | null}
 */
function resolveRoomSession(socket, registry, roomId) {
  const room = registry.get(roomId);
  if (!room) {
    // Комната уже удалена (race с leave/disconnect другого пути) — no-op.
    return null;
  }
  const participant = room.get(socket.id);
  if (!participant) {
    // Сокет более не числится участником этой комнаты — no-op.
    return null;
  }
  return { room, participant };
}

/**
 * Полный трёхшаговый резолв активной сессии сокета (post-review находка
 * задачи 11 — было продублировано в `postChat`): `socket.data.roomId` →
 * `registry.get(roomId)` → `room.get(socket.id)`, no-op (`null`) при любом
 * промахе. Используется методами без побочных эффектов до/во время резолва
 * (`postChat`, будущие `setMedia`/`relaySignal` — задачи 13/14). `leave()`
 * читает `socket.data.roomId` и сбрасывает его отдельно (нужно сделать это
 * ДО остальных проверок — специфика её семантики), поэтому использует
 * `resolveRoomSession` напрямую вместо этой обёртки.
 * @param {import('socket.io').Socket} socket
 * @param {import('../domain/RoomRegistry.js').RoomRegistry} registry
 * @returns {{roomId: string, room: import('../domain/Room.js').Room, participant: import('../domain/Participant.js').Participant} | null}
 */
function resolveSession(socket, registry) {
  const roomId = socket.data.roomId;
  if (!roomId) {
    // Нет успешного join по этому сокету — нет серверной сессии.
    return null;
  }
  const session = resolveRoomSession(socket, registry, roomId);
  if (!session) return null;
  return { roomId, ...session };
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
 * Double-join guard (SEC-11, post-review находка задачи 10): сокет,
 * уже состоящий в комнате (`socket.data.roomId` проставлен), отклоняется
 * обобщённой ошибкой `error{bad-payload}` ДО какого-либо обращения к
 * `registry`/`Room` — без guard'а повторный `join` перезаписал бы
 * `socket.data.roomId` новой комнатой, а прежняя комната навсегда сохранила
 * бы «призрачного» участника и никогда не была бы удалена из `RoomRegistry`.
 *
 * @param {import('socket.io').Socket} socket
 * @param {{roomId?: unknown, name?: unknown}} payload
 * @param {{io: import('socket.io').Server, config: object, registry: import('../domain/RoomRegistry.js').RoomRegistry}} ctx
 * @returns {void}
 */
export function join(socket, payload, ctx) {
  const { registry, config } = ctx;

  if (socket.data.roomId) {
    // Сокет уже состоит в другой комнате (предшествующий успешный join) —
    // повторный join по тому же соединению отклоняется без падения процесса
    // (F-40). Иначе `socket.data.roomId` был бы перезаписан новой комнатой,
    // а старая комната навсегда сохранила бы «призрачного» участника — её
    // `size()` никогда не достигнет 0, и она никогда не будет удалена из
    // `RoomRegistry` (утечка слота ROOMS_MAX, SEC-11). Не документированный
    // в §6.2 код `join:rejected`, поэтому тот же обобщённый транспортный
    // путь (SEC-15), что и структурно некорректный `roomId` ниже.
    socket.emit('error', { code: 'bad-payload', message: 'Некорректный запрос.' });
    return;
  }

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
  broadcastSystemEvent(socket, roomId, 'join', name);
}

/**
 * Явный выход из комнаты (`leave`) либо cleanup при обрыве (`disconnect`).
 * Задача 10 [critical], SEC-11.
 *
 * Единый путь для обоих триггеров (Design §6.1/§7.3: «leave — эквивалент
 * disconnect»): `socket/handlers.js` вызывает эту же функцию и на явное
 * событие `leave`, и на транспортный `disconnect`. Инварианты:
 *   - идемпотентность — сокет без предшествующего успешного `join`
 *     (`socket.data.roomId` не проставлен) либо уже вышедший (комната/
 *     участник отсутствуют) → безопасный no-op, без ошибки клиенту и без
 *     повторного broadcast;
 *   - остальным участникам уходят `participant:left{id}` +
 *     `chat:system{event:'leave', subjectName}` (снимок имени берётся ДО
 *     удаления участника из `Room`);
 *   - если после удаления `room.size() === 0` — комната целиком стирается из
 *     `RoomRegistry` (участники, счётчик, история) — SEC-11, комнату нельзя
 *     «оживить» остатками старого состояния при повторном входе по тому же
 *     `roomId` (`RoomRegistry.getOrCreate` создаст свежую `Room`).
 *
 * @param {import('socket.io').Socket} socket
 * @param {{io: import('socket.io').Server, config: object, registry: import('../domain/RoomRegistry.js').RoomRegistry}} ctx
 * @returns {void}
 */
export function leave(socket, ctx) {
  const { registry } = ctx;

  const roomId = socket.data.roomId;
  if (!roomId) {
    // Сокет никогда не входил в комнату (либо уже обработан выше) — nothing
    // to clean up.
    return;
  }
  // Схлопнуто в одно место (не дублируется по веткам ниже): как только
  // roomId прочитан и признан истинным, состояние сокета сбрасывается сразу,
  // до всех остальных проверок. Именно этот побочный эффект (сброс ДО
  // остальных проверок) не позволяет использовать здесь `resolveSession` —
  // она читает `socket.data.roomId` заново и увидела бы уже сброшенное
  // значение; общая часть резолва (`registry.get` → `room.get`) вынесена в
  // `resolveRoomSession` и используется напрямую с уже прочитанным `roomId`.
  socket.data.roomId = undefined;

  const session = resolveRoomSession(socket, registry, roomId);
  if (!session) {
    // Комната уже удалена (double leave/disconnect), либо этот сокет в ней
    // уже не числится (идемпотентность повторного leave/disconnect) — no-op,
    // без ошибки процесса и без повторного broadcast.
    return;
  }
  const { room, participant } = session;
  room.remove(socket.id);

  socket.leave(roomId);

  socket.to(roomId).emit('participant:left', { id: socket.id });
  broadcastSystemEvent(socket, roomId, 'leave', participant.name ?? '');

  if (room.size() === 0) {
    registry.delete(roomId);
  }
}

/**
 * Отправка сообщения чата с анти-спуфингом авторства (SEC-06). Задача 11
 * [critical].
 *
 * Rate-limit(chat) уже применён вызывающим `socket/handlers.js` до вызова
 * этой функции (Design §6.1). Пайплайн здесь: сессия сокета (`resolveSession`)
 * → `validateText` → `sanitize` → `Message{kind:'chat'}` с авторством ИЗ
 * СЕРВЕРНОЙ СЕССИИ (`socket.id`/`participant.name`) → push в историю комнаты
 * → broadcast `chat:message` всем в комнате, включая автора (Design §6.2/§7.4
 * — «всем в комнате»).
 *
 * Анти-спуфинг (SEC-06): `payload.authorId`/`authorName`/`id`/`ts`/`kind`
 * полностью игнорируются — `createChatMessage` строит `Message` только из
 * `socket.id` и серверного снимка `participant.name`, никогда из полей
 * клиентского payload.
 *
 * Без валидной сессии (сокет не состоит в комнате либо уже не числится
 * участником — race с `leave`/`disconnect`) — безопасный no-op, без ошибки
 * клиенту и без утечки в чужие комнаты (не бросает, не роняет процесс, F-40).
 *
 * @param {import('socket.io').Socket} socket
 * @param {{text?: unknown}} payload
 * @param {{io: import('socket.io').Server, config: object, registry: import('../domain/RoomRegistry.js').RoomRegistry}} ctx
 * @returns {void}
 */
export function postChat(socket, payload, ctx) {
  const { registry } = ctx;

  const session = resolveSession(socket, registry);
  if (!session) {
    // Нет валидной серверной сессии (нет успешного join, комната уже
    // удалена, либо сокет более не числится участником — race с
    // leave/disconnect) — нет авторства, из которого можно взять имя.
    // Безопасный no-op (SEC-06).
    return;
  }
  const { roomId, room, participant } = session;

  const textResult = validateText(payload?.text);
  if (!textResult.ok) {
    // Пустой/пробельный/не-строковый/слишком длинный текст (SEC-02) —
    // отклоняется молча, без broadcast и без ошибки клиенту.
    return;
  }
  const text = sanitize(textResult.value);
  if (text.length === 0) {
    // Defense-in-depth: санитизация не должна схлопывать валидный текст в
    // пустую строку в норме, но если это произошло — не рассылаем пустое
    // сообщение (симметрично validateText's empty-check).
    return;
  }

  // Авторство — ИСКЛЮЧИТЕЛЬНО из серверной сессии (SEC-06); поля
  // authorId/authorName/id/ts/kind клиентского payload игнорируются целиком.
  const message = createChatMessage({
    authorId: socket.id,
    authorName: participant.name,
    text,
  });

  room.pushMessage(message);

  ctx.io.to(roomId).emit('chat:message', message);
}

/**
 * Обновление статуса mic/cam участника и broadcast остальным. Задача 13
 * (F-09/16/18, US-7/12).
 *
 * Rate-limit(signal) уже применён вызывающим `socket/handlers.js` до вызова
 * этой функции (Design §6.1, общий бюджет категории `signal` с
 * `signal:offer/answer/ice`). Пайплайн здесь: сессия сокета (`resolveSession`)
 * → `validateMedia` (оба поля строго `boolean`) → обновить
 * `participant.media` → broadcast `media:state{id,audio,video}` ОСТАЛЬНЫМ
 * участникам комнаты (не автору — Plan §13 «broadcast остальным»,
 * симметрично `participant:joined`/`participant:left`; автор уже знает
 * собственный статус локально, F-18/§7.2).
 *
 * Без валидной сессии (сокет не состоит в комнате либо уже не числится
 * участником — race с `leave`/`disconnect`) либо при структурно некорректном
 * payload (не оба поля `boolean`) — безопасный no-op, без ошибки клиенту и
 * без падения процесса (F-40).
 *
 * @param {import('socket.io').Socket} socket
 * @param {{audio?: unknown, video?: unknown}} payload
 * @param {{io: import('socket.io').Server, config: object, registry: import('../domain/RoomRegistry.js').RoomRegistry}} ctx
 * @returns {void}
 */
export function setMedia(socket, payload, ctx) {
  const { registry } = ctx;

  const session = resolveSession(socket, registry);
  if (!session) {
    // Нет валидной серверной сессии — безопасный no-op (симметрично postChat).
    return;
  }
  const { roomId, participant } = session;

  const mediaResult = validateMedia(payload);
  if (!mediaResult.ok) {
    // Структурно некорректный payload (не оба поля boolean) — отклоняется
    // молча, без broadcast и без ошибки клиенту.
    return;
  }

  participant.setMedia(mediaResult.value);

  socket.to(roomId).emit('media:state', {
    id: socket.id,
    audio: mediaResult.value.audio,
    video: mediaResult.value.video,
  });
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
