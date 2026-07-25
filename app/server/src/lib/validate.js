/**
 * Серверная валидация ввода: имя участника и текст чат-сообщения.
 *
 * Валидация — единственная линия защиты от структурно некорректного/опасного
 * ввода ДО санитизации (`lib/sanitize.js`) и сохранения/ретрансляции.
 * Клиентская валидация (StartScreen/JoinGate) — только UX, серверная —
 * обязательный контроль (SEC-01/02), т.к. клиенту не доверяем.
 *
 * `validateName`: trim → непустое → ≤ `NAME_MAX` → allow-list символов
 * (буквы любого алфавита, цифры, пробел, ограниченная пунктуация:
 * апостроф, дефис, точка). Управляющие символы и HTML-метасимволы вне
 * allow-list — отклоняются (SEC-01, SEC-03 — защита на входе, до того как
 * дело дойдёт до `sanitize`).
 *
 * `validateText`: trim → непустое → ≤ `MESSAGE_MAX`. Без allow-list —
 * пунктуация/спецсимволы разрешены; безопасность текста обеспечивает
 * `sanitize` (SEC-03), а не отклонение валидатором (SEC-02).
 *
 * Соглашение результата (как у `RoomRegistry.getOrCreate`):
 *   успех — `{ ok: true, value }`; отказ — `{ ok: false, code }`.
 *
 * Requirements: F-38, F-39, US-1, US-8, SEC-01, SEC-02, SEC-03.
 * Design: §4.1, §7.4, §10.1.
 */

import { NAME_MAX, MESSAGE_MAX } from '../config.js';

/**
 * Allow-list символов имени: буквы (любой Unicode-алфавит), цифры, пробел,
 * ограниченная пунктуация (апостроф, дефис, точка). Осознанно НЕ включает
 * `< > / \ ( ) " : ;` и т.п. — этого достаточно, чтобы отклонить все
 * известные XSS-пейлоады (`<script>`, `<img onerror>`, `javascript:`, `<svg/onload>`).
 */
const NAME_ALLOWED_RE = /^[\p{L}\p{N} '\-.]+$/u;

/**
 * Валидирует имя участника.
 * @param {unknown} raw
 * @returns {{ok: true, value: string} | {ok: false, code: string}}
 */
export function validateName(raw) {
  if (typeof raw !== 'string') {
    return { ok: false, code: 'invalid-type' };
  }

  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return { ok: false, code: 'empty' };
  }

  if (trimmed.length > NAME_MAX) {
    return { ok: false, code: 'too-long' };
  }

  if (!NAME_ALLOWED_RE.test(trimmed)) {
    return { ok: false, code: 'invalid-chars' };
  }

  return { ok: true, value: trimmed };
}

/**
 * Валидирует текст чат-сообщения.
 * @param {unknown} raw
 * @returns {{ok: true, value: string} | {ok: false, code: string}}
 */
export function validateText(raw) {
  if (typeof raw !== 'string') {
    return { ok: false, code: 'invalid-type' };
  }

  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return { ok: false, code: 'empty' };
  }

  if (trimmed.length > MESSAGE_MAX) {
    return { ok: false, code: 'too-long' };
  }

  return { ok: true, value: trimmed };
}

export default { validateName, validateText };
