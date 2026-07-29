/**
 * Сообщение истории комнаты — discriminated union `chat | system` (§5.1).
 *
 * `kind: 'chat'`   — сообщение автора; `authorId`/`authorName` проставляет
 *                     СЕРВЕР (никогда не берётся из клиентского payload,
 *                     SEC-06), текст уже провалидирован+санитизирован
 *                     (SEC-02/03) вызывающей стороной (`lib/validate.js`,
 *                     `lib/sanitize.js` — задача 4).
 * `kind: 'system'` — служебное уведомление о входе/выходе (F-15).
 *
 * Requirements: F-09, F-16, F-30, SEC-06, SEC-09. Design: §5.1.
 */

import { randomUUID } from 'node:crypto';

/**
 * @param {object} params
 * @param {string} params.authorId - socket.id автора (проставляется сервером).
 * @param {string} params.authorName - снимок имени автора на момент отправки.
 * @param {string} params.text - валидированный+санитизированный текст сообщения.
 * @returns {object} Message (kind: 'chat').
 */
export function createChatMessage({ authorId, authorName, text }) {
  return {
    id: randomUUID(),
    kind: 'chat',
    ts: Date.now(),
    authorId,
    authorName,
    text,
  };
}

/**
 * @param {object} params
 * @param {'join'|'leave'} params.event
 * @param {string} params.subjectName - имя участника, о котором событие.
 * @returns {object} Message (kind: 'system').
 */
export function createSystemMessage({ event, subjectName }) {
  return {
    id: randomUUID(),
    kind: 'system',
    ts: Date.now(),
    event,
    subjectName,
  };
}

/** @param {object} message @returns {boolean} */
export function isChatMessage(message) {
  return !!message && message.kind === 'chat';
}

/** @param {object} message @returns {boolean} */
export function isSystemMessage(message) {
  return !!message && message.kind === 'system';
}
