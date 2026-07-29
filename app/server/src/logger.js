/**
 * Обезличенное логирование (SEC-16): тип события, усечённый/хешированный
 * `roomId`, `socketId`. Секретов/PII в репо и в логах быть не должно.
 *
 * Технически ЗАПРЕЩЕНО передать в лог: текст сообщений чата, имена
 * участников, полные SDP/ICE-payload'ы, IP-адреса. Инвариант обеспечивается
 * **allow-list полей на входе** (а не запоминанием, что нельзя логировать):
 * `log(eventType, fields)` принимает СТРОГО заданный набор ключей
 * (`ALLOWED_FIELDS`); любой другой ключ (`message`, `name`, `sdp`,
 * `candidate`, `ip`, …) приводит к `throw TypeError` — вызывающий код не
 * может случайно «протащить» запрещённое поле мимо ревью, опечатка/copy-paste
 * ловится сразу же в рантайме (и будет покрыта тестами вызывающих модулей).
 *
 * `roomId` — единственный секрет входа в комнату (SEC-14/21, `crypto.randomUUID`).
 * Логировать его сырым везде, где нужна лишь корреляция записей одной
 * комнаты, увеличивало бы поверхность утечки (агрегаторы логов, доступ
 * саппорта и т.п.). Поэтому `roomId` в логе — НИКОГДА не сырая строка:
 * усекается до `sha256(roomId)`, взятого по первым 8 hex-символам —
 * детерминированно (одинаковый вход даёт одинаковый вывод, записи одной
 * комнаты коррелируются), но необратимо для восстановления исходного
 * `roomId` из лога.
 *
 * `socketId` — эфемерный внутренний идентификатор соединения Socket.io
 * (не IP, не PII) — логируется как есть, но обязан быть строкой (см. ниже).
 *
 * Оба допустимых поля, если переданы, обязаны быть примитивной строкой —
 * это блокирует ещё один способ протащить PII: передачу целого объекта
 * (напр. `{socketId: participant}`, где `participant` содержит `name`)
 * вместо плоского идентификатора.
 *
 * Requirements: SEC-16, SEC-14/21. Design: §10.4.
 */
import { createHash } from 'node:crypto';

/** Единственные допустимые поля контекста события (allow-list, не blacklist). */
const ALLOWED_FIELDS = new Set(['roomId', 'socketId']);

/**
 * Необратимо усекает `roomId` до короткого детерминированного хеша —
 * НИКОГДА не возвращает исходную строку целиком.
 *
 * @param {string} roomId
 * @returns {string}
 */
function hashRoomId(roomId) {
  return createHash('sha256').update(roomId).digest('hex').slice(0, 8);
}

/**
 * Логирует событие без PII. Единственная точка вывода в модуле.
 *
 * @param {string} eventType — тип события (напр. `'join'`, `'leave'`,
 *   `'rate-limited'`); произвольная строка, не подлежит allow-list'у.
 * @param {{roomId?: string, socketId?: string}} [fields] — контекст события;
 *   ДОПУСТИМЫ ТОЛЬКО ключи `roomId`/`socketId`. Любой иной ключ или
 *   нестроковое значение допустимого ключа → `TypeError`, ничего не
 *   логируется.
 * @returns {{event: string, roomId?: string, socketId?: string}} фактически
 *   залогированная (обезличенная) запись — удобно для тестов/дальнейшей
 *   агрегации без повторного парсинга вывода.
 * @throws {TypeError} `eventType` не непустая строка; в `fields` есть ключ
 *   вне `ALLOWED_FIELDS`; либо `roomId`/`socketId` заданы не строкой.
 */
export function log(eventType, fields = {}) {
  if (typeof eventType !== 'string' || eventType.length === 0) {
    throw new TypeError('logger.log: eventType должен быть непустой строкой');
  }

  if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) {
    throw new TypeError('logger.log: fields должен быть plain-объектом');
  }

  const unknownKeys = Object.keys(fields).filter((key) => !ALLOWED_FIELDS.has(key));
  if (unknownKeys.length > 0) {
    throw new TypeError(
      `logger.log: запрещённые/неизвестные поля контекста: ${unknownKeys.join(', ')} ` +
        `(SEC-16 — разрешены только: ${[...ALLOWED_FIELDS].join(', ')}). ` +
        'Текст сообщений, имена, полные SDP/ICE и IP логировать нельзя.',
    );
  }

  const entry = { event: eventType };

  if ('roomId' in fields) {
    if (typeof fields.roomId !== 'string' || fields.roomId.length === 0) {
      throw new TypeError('logger.log: roomId должен быть непустой строкой');
    }
    entry.roomId = hashRoomId(fields.roomId);
  }

  if ('socketId' in fields) {
    if (typeof fields.socketId !== 'string' || fields.socketId.length === 0) {
      throw new TypeError('logger.log: socketId должен быть непустой строкой');
    }
    entry.socketId = fields.socketId;
  }

  console.log(JSON.stringify(entry));

  return entry;
}

export default { log };
