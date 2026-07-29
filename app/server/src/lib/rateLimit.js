/**
 * Rate-limit (SEC-05): token-bucket на СОЕДИНЕНИЕ, отдельный бюджет на
 * КАТЕГОРИЮ событий (chat/signal/join).
 *
 * Троттлинг событий сокета до того, как они дойдут до бизнес-логики: превышение
 * бюджета → вызывающий код (каркас хендлеров, задача 8) отклоняет событие и
 * эмитит клиенту `error{code:'rate-limited'}`. Модуль сам никогда не бросает —
 * флуд не должен приводить к падению единственного инстанса сервера (F-40).
 *
 * Алгоритм: классический token-bucket. Бакет на пару (socketId, category)
 * хранит `tokens` (дробное число, ≤ `points`) и `updatedAt` (мс, `Date.now()`).
 * При каждом вызове `allow`: сперва «дольём» бакет пропорционально прошедшему
 * времени (`elapsed * points / durationMs`), но не выше cap `points` (бакет не
 * копит токены за время простоя сверх burst-лимита) — затем, если есть ≥ 1
 * токен, спишем 1 и вернём `true`; иначе `true` не даём — `false`.
 *
 * Лимиты (points/durationMs на категорию) — ЕДИНСТВЕННЫЙ источник:
 * `config.js` (`RATE_LIMIT`). Здесь не хардкодятся.
 *
 * Время — `Date.now()`, чтобы модуль был тестируем через `vi.useFakeTimers()`
 * (тесты мокают именно `Date`).
 *
 * Управление памятью: `buckets` — module-level `Map`, растущая на каждую новую
 * пару (socketId, category). На долгоживущем single-instance сервере (Design
 * §4.1) она НЕ очищается сама по себе — вызывающий код обязан вызвать
 * `release(socketId)` при дисконнекте соединения, иначе Map растёт
 * неограниченно (churn соединений), подрывая саму цель SEC-05/F-40 (защита от
 * исчерпания ресурсов). Точка вызова — будущий socket-disconnect-хендлер
 * (задачи 6/8/10, каркас socket.io-gateway/handlers).
 *
 * Requirements: F-40, SEC-05. Design: §4.1, §9.3, §10.1.
 */

import { RATE_LIMIT } from '../config.js';

/**
 * Бакеты по ключу `${socketId}::${category}`.
 * @type {Map<string, {tokens: number, updatedAt: number}>}
 */
const buckets = new Map();

/**
 * Возвращает true и «тратит» один токен, если бюджет категории для данного
 * соединения ещё не исчерпан; false — если исчерпан. Никогда не бросает.
 *
 * @param {string} socketId — идентификатор соединения (лимит на соединение).
 * @param {string} category — категория события (`chat`|`signal`|`join`, из RATE_LIMIT).
 * @returns {boolean}
 */
export function allow(socketId, category) {
  const limit = RATE_LIMIT[category];

  // Неизвестная категория — нет конфигурации лимита. Безопасный отказ, а не
  // throw: вызывающий код не должен уронить сервер из-за опечатки/неизвестного
  // события (F-40).
  if (!limit) {
    return false;
  }

  const { points, durationMs } = limit;
  const key = `${socketId}::${category}`;
  const now = Date.now();

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: points, updatedAt: now };
    buckets.set(key, bucket);
  }

  const elapsed = now - bucket.updatedAt;
  if (elapsed > 0) {
    const refill = (elapsed * points) / durationMs;
    bucket.tokens = Math.min(points, bucket.tokens + refill);
    bucket.updatedAt = now;
  }

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }

  return false;
}

/**
 * Освобождает все бакеты данного соединения — удаляет из `buckets` записи
 * ВСЕХ категорий (`chat`/`signal`/`join`), заведённые под этот `socketId`.
 *
 * Предназначена для вызова будущим socket-disconnect-хендлером (задачи
 * 6/8/10) в момент разрыва соединения, чтобы предотвратить неограниченный
 * рост module-level `buckets` Map на долгоживущем single-instance сервере
 * (SEC-05/F-40). Безопасна для неизвестного/уже освобождённого socketId —
 * no-op, никогда не бросает (идемпотентна).
 *
 * @param {string} socketId — идентификатор соединения, чьи бакеты удаляются.
 * @returns {void}
 */
export function release(socketId) {
  for (const category of Object.keys(RATE_LIMIT)) {
    buckets.delete(`${socketId}::${category}`);
  }
}

export default { allow, release };
