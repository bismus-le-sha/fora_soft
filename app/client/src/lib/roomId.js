/**
 * Энтропия room-id (SEC-14, critical — задача 19).
 *
 * Design §4.2 (`StartScreen.jsx` вызывает генерацию roomId при «Создать
 * комнату»), §6.4 (URL-контракт: «Создание комнаты на StartScreen генерирует
 * `roomId = crypto.randomUUID()` и делает `navigate(/room/:roomId)`»), §10.4
 * (SEC-14, high): «`roomId = crypto.randomUUID()` (UUIDv4, ~122 бита) на
 * клиенте при «Создать комнату»; сервер принимает любой валидный по форме
 * id. Единственная техническая защита входа».
 *
 * Requirements: SEC-14, F-01, F-02, US-1, US-2.
 *
 * Источник энтропии — **исключительно глобальный Web Crypto**
 * (`globalThis.crypto.randomUUID`), тот же CSPRNG, что доступен в браузере.
 * Namespace `node:crypto` в клиентском коде намеренно не используется: это
 * серверный/Node-only API, недоступный в браузере в такой форме — клиент
 * должен работать на том же примитиве, что реально исполняется в проде
 * (browser runtime), а не на его Node-аналоге, который в бандл не попадёт.
 *
 * Логика намеренно вынесена в отдельный тестируемый юнит (а не встроена в
 * `StartScreen.jsx`) — так энтропия/формат id проверяются изолированно от
 * React-рендеринга (см. `tests/lib/roomId.test.js`).
 */

/**
 * Генерирует криптографически непредсказуемый идентификатор комнаты.
 *
 * UUIDv4 (RFC 4122) — версия и вариант фиксированы самим `crypto.randomUUID`,
 * ~122 бита случайности. Без последовательных/timestamp-based схем: каждый
 * вызов — независимый CSPRNG-запрос, без внутреннего состояния/счётчика.
 *
 * @returns {string} UUIDv4-строка, пригодная как `roomId` в URL (`/room/:id`).
 */
export function generateRoomId() {
  return globalThis.crypto.randomUUID();
}

/**
 * Косметический «код комнаты» для верхней плашки (задача 38, design-ui
 * addendum §5.2, README §4: `RM-4F2A`).
 *
 * SEC-14 (§10.4 TDD, addendum §4/§5.2): это ЧИСТО отображение — не новая
 * схема идентификаторов. Реальный `roomId` (UUIDv4, §6.4) не меняется, не
 * заменяется и не изменяется этой функцией; она только форматирует его для
 * показа. Коллизия отображаемого кода у двух разных комнат допустима — это
 * декоративная деталь, не идентификатор (см. addendum §5.2).
 *
 * @param {string} [roomId] — реальный `roomId` (UUIDv4 из URL/`join`).
 * @returns {string} `RM-XXXX` — первые 4 hex-символа `roomId` (без дефисов),
 *   в верхнем регистре; пустая строка, если `roomId` не передан.
 */
export function formatRoomCode(roomId) {
  if (!roomId) {
    return '';
  }
  const code = roomId.replace(/-/g, '').slice(0, 4).toUpperCase();
  return `RM-${code}`;
}
