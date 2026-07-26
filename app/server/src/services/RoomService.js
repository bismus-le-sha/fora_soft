/**
 * RoomService — бизнес-логика комнаты: join/leave/chat/media/signal.
 *
 * ЗАДАЧА 8 (каркас): здесь только СТАБЫ, фиксирующие контракт из Design §4.1
 * (таблица компонентов) — сигнатуры и точки расширения, БЕЗ реализации
 * бизнес-инвариантов. `socket/handlers.js` уже делегирует сюда, но реальное
 * поведение (атомарный join/лимит 4, cleanup комнаты, анти-спуфинг автора
 * чата, история, media:state, relay сигналинга) наполняется задачами 9–14
 * (join/leave/chat — [critical], test-first). Реализовывать бизнес-логику
 * здесь до соответствующей задачи — не в скоупе задачи 8, поэтому тела
 * методов намеренно пустые (no-op) и никогда не бросают.
 *
 * Requirements: F-40, SEC-05, SEC-15 (каркас). Полные требования по методам —
 * см. задачи 9–14 в `impl-video-chat-room.md`.
 * Design: §4.1 (таблица `services/RoomService.js`), §5.1, §5.2, §6.1, §7.
 */

/**
 * Атомарный вход в комнату (лимит 4 участника, SEC-07). Задача 9 [critical].
 * @param {import('socket.io').Socket} socket
 * @param {{roomId?: string, name?: string}} payload
 * @param {{io: import('socket.io').Server, config: object, registry: import('../domain/RoomRegistry.js').RoomRegistry}} ctx
 * @returns {void}
 */
export function join(_socket, _payload, _ctx) {
  // TODO(задача 9, critical, SEC-07): rate-limit(join) уже применён вызывающим
  // handlers.js; здесь — validateName → sanitize → атомарный RoomRegistry
  // .getOrCreate → room.isFull()→room.add() без await → join:ok/join:rejected
  // инициатору + participant:joined/chat:system остальным.
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
