/**
 * Серверная валидация ввода: имя участника, текст чат-сообщения, статус
 * mic/cam (`media:state`).
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
 * `validateMedia`: `audio`/`video` обязаны быть примитивным `boolean` —
 * никакого приведения типов (`!!value`), иначе структурно некорректный
 * payload (например, строка/число/объект) молча превратился бы в валидный
 * статус тумблера. Design §6.1 `media:state`: `{ audio: boolean, video: boolean }`.
 *
 * Соглашение результата (как у `RoomRegistry.getOrCreate`):
 *   успех — `{ ok: true, value }`; отказ — `{ ok: false, code }`.
 *
 * Requirements: F-09, F-16, F-18, F-38, F-39, US-1, US-7, US-8, US-12,
 * SEC-01, SEC-02, SEC-03.
 * Design: §4.1, §6.1, §7.2, §7.4, §10.1.
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

/**
 * Валидирует payload `media:state` — оба поля обязаны быть примитивным
 * `boolean` (без приведения типов, SEC-08 defense-in-depth: структурно
 * некорректный payload не должен молча стать валидным статусом).
 * @param {unknown} raw
 * @returns {{ok: true, value: {audio: boolean, video: boolean}} | {ok: false, code: string}}
 */
export function validateMedia(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, code: 'invalid-type' };
  }

  const { audio, video } = raw;
  if (typeof audio !== 'boolean' || typeof video !== 'boolean') {
    return { ok: false, code: 'invalid-type' };
  }

  return { ok: true, value: { audio, video } };
}

export default { validateName, validateText, validateMedia };
