/**
 * Юнит-тесты token-bucket rate-limit на соединение — `lib/rateLimit.js`.
 *
 * Test-first (red): модуль `src/lib/rateLimit.js` ещё НЕ существует —
 * реализацию пишет `implementer` (задача 5.2). Эти тесты — исполняемая
 * спецификация контракта.
 *
 * Контракт (TDD §4.1, §9.3, §10.1 SEC-05):
 *   allow(socketId, category) -> boolean
 *     Token-bucket ПО СОЕДИНЕНИЮ и ПО КАТЕГОРИИ (chat/signal/join).
 *     Возвращает true и «тратит» токен, если бюджет есть; false — если
 *     бюджет исчерпан (событие должно быть отклонено вызывающим →
 *     `error{rate-limited}`). Никогда не бросает на флуде («без падения
 *     сервера», F-40/SEC-05). Токены восстанавливаются со временем.
 *
 * Соглашения тестов:
 *   - Лимиты НЕ хардкодятся: берутся из `RATE_LIMIT` в `config.js`
 *     (критерий приёмки «лимиты берутся из config.js»). Категории и их
 *     значения читаются оттуда же.
 *   - Изоляция состояния между тестами достигается уникальными socketId
 *     на каждый тест (модуль хранит бакеты по socketId; переиспользование id
 *     не требуется). Никакого reset-экспорта контракт не предполагает.
 *   - Восстановление токенов проверяется fake timers (план 5.1). Реализация
 *     ДОЛЖНА измерять время источником, управляемым vitest fake timers
 *     (`Date.now()`), — иначе модуль нетестируем по времени.
 *
 * Requirements: F-40, SEC-05. Design: §4.1, §9.3, §10.1. Plan: задача 5.1.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { allow, release } from '../../src/lib/rateLimit.js';
import { RATE_LIMIT } from '../../src/config.js';

/** Категории, для которых определены лимиты в config.js. */
const CATEGORIES = Object.keys(RATE_LIMIT); // ['chat','signal','join']

/** Уникальный socketId на каждый вызов — гарантирует свежий бакет. */
let seq = 0;
const uid = (label = 'sock') => `${label}_${seq++}`;

/** Вызвать allow n раз подряд, вернуть массив результатов. */
function callN(socketId, category, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(allow(socketId, category));
  return out;
}

/** Число подряд идущих true с начала массива. */
function leadingTrue(results) {
  let n = 0;
  for (const r of results) {
    if (r === true) n++;
    else break;
  }
  return n;
}

beforeEach(() => {
  // Fake timers мокают и Date — token-bucket refill управляем через advance.
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('rateLimit.allow — контракт (TDD §4.1, SEC-05)', () => {
  it('экспортирует функцию allow', () => {
    expect(typeof allow).toBe('function');
  });

  it('возвращает строго boolean (не truthy/falsy)', () => {
    const r = allow(uid(), 'chat');
    expect(typeof r).toBe('boolean');
  });
});

describe('rateLimit.allow — burst в пределах лимита проходит (SEC-05)', () => {
  it.each(CATEGORIES)(
    'категория "%s": первые points вызовов разрешены, следующий отклонён',
    (category) => {
      const { points } = RATE_LIMIT[category];
      const socketId = uid(category);

      // Burst ровно на весь бюджет — все проходят.
      const burst = callN(socketId, category, points);
      expect(burst.every((r) => r === true)).toBe(true);
      expect(leadingTrue(burst)).toBe(points);

      // Следующий (points+1) — за пределом бюджета → отклонён.
      expect(allow(socketId, category)).toBe(false);
    },
  );

  it('лимиты берутся из config.js: размер burst = RATE_LIMIT[category].points', () => {
    for (const category of CATEGORIES) {
      const { points } = RATE_LIMIT[category];
      const socketId = uid(category);
      // Ровно points true, затем сразу false — граница совпадает с config.
      const results = callN(socketId, category, points + 3);
      expect(leadingTrue(results)).toBe(points);
      expect(results.slice(points).every((r) => r === false)).toBe(true);
    }
  });
});

describe('rateLimit.allow — превышение отклоняется без падения (F-40, SEC-05)', () => {
  it('флуд после исчерпания бюджета стабильно возвращает false и не бросает', () => {
    const category = 'chat';
    const { points } = RATE_LIMIT[category];
    const socketId = uid();

    callN(socketId, category, points); // исчерпать бюджет

    expect(() => {
      for (let i = 0; i < 1000; i++) {
        expect(allow(socketId, category)).toBe(false);
      }
    }).not.toThrow();
  });

  it('бакет не «переполняется»: после долгого простоя burst всё равно ≤ points', () => {
    const category = 'chat';
    const { points, durationMs } = RATE_LIMIT[category];
    const socketId = uid();

    callN(socketId, category, points); // исчерпать
    // Простой много длиннее окна — токены НЕ должны копиться сверх cap.
    vi.advanceTimersByTime(durationMs * 100);

    const results = callN(socketId, category, points + 3);
    expect(leadingTrue(results)).toBe(points);
    expect(results.slice(points).every((r) => r === false)).toBe(true);
  });
});

describe('rateLimit.allow — восстановление токенов со временем (fake timers)', () => {
  it('после полного окна durationMs бюджет восстанавливается целиком', () => {
    const category = 'chat';
    const { points, durationMs } = RATE_LIMIT[category];
    const socketId = uid();

    // Исчерпать бюджет.
    expect(callN(socketId, category, points).every((r) => r === true)).toBe(true);
    expect(allow(socketId, category)).toBe(false);

    // Прошло полное окно — бюджет снова полный.
    vi.advanceTimersByTime(durationMs);
    const refilled = callN(socketId, category, points);
    expect(refilled.every((r) => r === true)).toBe(true);
  });

  it('токены НЕ восстанавливаются мгновенно: до накопления одного токена — false', () => {
    const category = 'chat';
    const { points, durationMs } = RATE_LIMIT[category];
    const socketId = uid();

    callN(socketId, category, points); // исчерпать
    expect(allow(socketId, category)).toBe(false);

    // Прошло меньше интервала одного токена (durationMs/points) → токена ещё нет.
    const halfToken = Math.floor(durationMs / points / 2);
    vi.advanceTimersByTime(halfToken);
    expect(allow(socketId, category)).toBe(false);
  });

  it('частичное восстановление: за интервал одного токена возвращается ровно один', () => {
    const category = 'chat';
    const { points, durationMs } = RATE_LIMIT[category];
    const socketId = uid();

    callN(socketId, category, points); // исчерпать
    expect(allow(socketId, category)).toBe(false);

    // Прошёл интервал ровно одного токена (durationMs/points).
    vi.advanceTimersByTime(durationMs / points);
    expect(allow(socketId, category)).toBe(true); // восстановлен один
    expect(allow(socketId, category)).toBe(false); // и снова пусто (частичное, не полное)
  });
});

describe('rateLimit.allow — изоляция бакетов (лимит НА СОЕДИНЕНИЕ, SEC-05)', () => {
  it('исчерпание бюджета одного socketId не влияет на другой socketId', () => {
    const category = 'chat';
    const { points } = RATE_LIMIT[category];
    const a = uid('a');
    const b = uid('b');

    callN(a, category, points); // исчерпать A
    expect(allow(a, category)).toBe(false);

    // B — независимый бакет, полный бюджет доступен.
    const bBurst = callN(b, category, points);
    expect(bBurst.every((r) => r === true)).toBe(true);
  });

  it('исчерпание одной категории не влияет на другую категорию того же соединения', () => {
    const socketId = uid();
    const { points: chatPoints } = RATE_LIMIT.chat;

    callN(socketId, 'chat', chatPoints); // исчерпать chat
    expect(allow(socketId, 'chat')).toBe(false);

    // signal того же соединения — отдельный бакет, доступен.
    expect(allow(socketId, 'signal')).toBe(true);
  });
});

/**
 * РЕГРЕССИЯ (red) на находку `/code-review` (round 2, CONFIRMED),
 * `rateLimit.js:32` — module-level `buckets` Map никогда не очищается: нет
 * eviction / TTL / dispose-хука. На долгоживущем single-instance сервере
 * (Design §4.1) каждое соединение оставляет 1–3 постоянные записи в Map даже
 * после дисконнекта → неограниченный рост, подрывает саму цель SEC-05/F-40
 * (защита от исчерпания ресурсов).
 *
 * Контракт фикса (эта сюита — исполняемая спецификация): модуль экспортирует
 * `release(socketId)` — удаляет ВСЕ бакеты (по всем категориям chat/signal/join)
 * данного соединения. Даёт будущим задачам (6/8/10 — gateway/handlers/disconnect)
 * точку вызова при дисконнекте, устраняя утечку.
 *
 * `buckets` не экспортирован — проверяем ПОВЕДЕНЧЕСКИ, через наблюдаемый `allow`:
 * если бакет удалён, следующий `allow` без advance таймеров снова видит ПОЛНЫЙ
 * бюджет (свежий бакет `tokens = points`), а не частичный refill по времени.
 *
 * Requirements: F-40, SEC-05. Design: §4.1, §9.3, §10.1.
 */
describe('rateLimit.release — очистка бакетов соединения при дисконнекте (SEC-05, F-40)', () => {
  it('экспортирует функцию release', () => {
    expect(typeof release).toBe('function');
  });

  it('после release исчерпанный бюджет снова доступен ЦЕЛИКОМ (бакет удалён → «новое» соединение)', () => {
    const category = 'chat';
    const { points } = RATE_LIMIT[category];
    const socketId = uid();

    // Исчерпать бюджет.
    expect(callN(socketId, category, points).every((r) => r === true)).toBe(true);
    expect(allow(socketId, category)).toBe(false);

    // Освободить соединение — бакет должен быть УДАЛЁН (не «дозаправлен»).
    release(socketId);

    // Тот же socketId получает полный бюджет БЕЗ advance таймеров: время не
    // двигалось, значит доступность = удаление бакета, а не временной refill.
    const afterRelease = callN(socketId, category, points);
    expect(afterRelease.every((r) => r === true)).toBe(true);
    expect(leadingTrue(afterRelease)).toBe(points);
    // И снова ровно на границе бюджета — свежий бакет ведёт себя как новый.
    expect(allow(socketId, category)).toBe(false);
  });

  it('release очищает ВСЕ категории соединения (chat/signal/join) за один вызов', () => {
    const socketId = uid();

    // Исчерпать бюджет каждой категории этого соединения.
    for (const category of CATEGORIES) {
      const { points } = RATE_LIMIT[category];
      callN(socketId, category, points);
      expect(allow(socketId, category)).toBe(false);
    }

    // Один release — обнуляет бакеты ВСЕХ категорий разом.
    release(socketId);

    for (const category of CATEGORIES) {
      const { points } = RATE_LIMIT[category];
      const refilled = callN(socketId, category, points);
      expect(refilled.every((r) => r === true)).toBe(true);
      expect(leadingTrue(refilled)).toBe(points);
    }
  });

  it('release на неизвестном/неиспользованном socketId — безопасный no-op, не бросает', () => {
    // Никогда не вызывавшийся id.
    expect(() => release(uid('never-seen'))).not.toThrow();

    // Повторный release уже освобождённого id тоже безопасен (идемпотентность).
    const socketId = uid();
    callN(socketId, 'chat', RATE_LIMIT.chat.points);
    release(socketId);
    expect(() => release(socketId)).not.toThrow();
  });

  it('release одного socketId НЕ влияет на бакеты другого socketId (изоляция)', () => {
    const category = 'chat';
    const { points } = RATE_LIMIT[category];
    const a = uid('a');
    const b = uid('b');

    // Исчерпать оба соединения.
    callN(a, category, points);
    callN(b, category, points);
    expect(allow(a, category)).toBe(false);
    expect(allow(b, category)).toBe(false);

    // Освободить ТОЛЬКО A.
    release(a);

    // B остаётся исчерпанным — release его бакет не тронул.
    expect(allow(b, category)).toBe(false);
    // A снова доступен целиком.
    expect(callN(a, category, points).every((r) => r === true)).toBe(true);
  });
});
