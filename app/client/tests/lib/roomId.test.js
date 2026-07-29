import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateRoomId, formatRoomCode } from '../../src/lib/roomId.js';

/**
 * Задача 19.1 [critical] — Энтропия room-id (SEC-14). Test-first (red).
 *
 * Требования: SEC-14, F-02, US-2. Design: §6.4, §10 (SEC-14), §11 (test-first).
 * Security-baseline §14 (SEC-14, high): «Room-id криптографически непредсказуем:
 * достаточная энтропия (≥122 бит, UUIDv4/`crypto.randomUUID`), без
 * последовательностей/угадываемых схем. Единственная техническая защита входа
 * при отсутствии authZ».
 *
 * Контракт (фиксируется этим тестом как test-author): модуль `src/lib/roomId.js`
 * экспортирует чистую функцию `generateRoomId(): string`, возвращающую UUIDv4,
 * полученный через ГЛОБАЛЬНЫЙ Web-Crypto CSPRNG `crypto.randomUUID()` (тот же
 * источник, что доступен в браузере; Node-only `node:crypto` в клиентском коде
 * недопустим). Логика энтропии вынесена в отдельный тестируемый юнит,
 * `StartScreen` лишь вызывает её (см. StartScreen.test.jsx).
 */

/** RFC 4122 §4.1.3 — версия 4 (13-й hex-символ = '4'), вариант 10xx (17-й ∈ 8/9/a/b). */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('generateRoomId — энтропия room-id (SEC-14, Design §6.4/§10)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('happy-path: формат UUIDv4', () => {
    it('возвращает непустую строку', () => {
      const id = generateRoomId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('строго соответствует формату UUIDv4 (версия 4 + вариант 10xx, ~122 бита)', () => {
      const id = generateRoomId();
      expect(id).toMatch(UUID_V4);
    });

    it('версия и вариант зафиксированы: 13-й символ = "4", 17-й ∈ {8,9,a,b}', () => {
      const id = generateRoomId();
      expect(id[14]).toBe('4'); // 13-й hex после учёта двух дефисов на позициях 8 и 13
      expect('89ab').toContain(id[19].toLowerCase());
    });
  });

  describe('security: источник энтропии — CSPRNG crypto.randomUUID (SEC-14)', () => {
    it('делегирует генерацию глобальному crypto.randomUUID и возвращает именно его результат', () => {
      const spy = vi
        .spyOn(globalThis.crypto, 'randomUUID')
        .mockReturnValue('11111111-1111-4111-8111-111111111111');

      const id = generateRoomId();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(id).toBe('11111111-1111-4111-8111-111111111111');
    });

    it('НЕ использует небезопасный источник Math.random()', () => {
      const spy = vi.spyOn(Math, 'random');
      generateRoomId();
      expect(spy).not.toHaveBeenCalled();
    });

    it('НЕ основан на времени (Date.now застыл → id всё равно различны, значит не timestamp-схема)', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
      const a = generateRoomId();
      const b = generateRoomId();
      const c = generateRoomId();
      expect(new Set([a, b, c]).size).toBe(3);
    });
  });

  describe('uniqueness: большая выборка без коллизий', () => {
    it('10 000 генераций — все уникальны и валидны как UUIDv4', () => {
      const N = 10_000;
      const ids = new Set();
      for (let i = 0; i < N; i += 1) {
        const id = generateRoomId();
        expect(id).toMatch(UUID_V4);
        ids.add(id);
      }
      expect(ids.size).toBe(N);
    });
  });

  describe('edge: отсутствие последовательных/угадываемых схем', () => {
    it('два подряд сгенерированных id различны (не константа/не переиспользование)', () => {
      expect(generateRoomId()).not.toBe(generateRoomId());
    });

    it('партия из 1000 не отсортирована по возрастанию (исключает инкрементный счётчик)', () => {
      const batch = Array.from({ length: 1000 }, () => generateRoomId());
      const sorted = [...batch].sort();
      expect(batch).not.toEqual(sorted);
    });

    it('соседние id не отличаются на фиксированный шаг (не арифметическая прогрессия)', () => {
      const toBig = (id) => BigInt(`0x${id.replace(/-/g, '')}`);
      const batch = Array.from({ length: 50 }, () => toBig(generateRoomId()));
      const deltas = batch.slice(1).map((v, i) => v - batch[i]);
      const uniqueDeltas = new Set(deltas.map(String));
      expect(uniqueDeltas.size).toBeGreaterThan(1);
    });
  });
});

/**
 * Задача 38 — `formatRoomCode` (design-ui addendum §5.2, README §4: «код
 * комнаты `RM-4F2A`»). Критерий приёмки: покрыт юнит-тестом, не искажает и
 * не заменяет реальный `roomId`, используемый в `join`/URL (SEC-14).
 */
describe('formatRoomCode — косметический код комнаты (addendum §5.2, SEC-14)', () => {
  it('форматирует UUIDv4 как `RM-` + первые 4 hex-символа без дефисов, в верхнем регистре', () => {
    expect(formatRoomCode('4f2a9c11-70e2-4b3a-9c2d-1a2b3c4d5e6f')).toBe('RM-4F2A');
  });

  it('приводит к верхнему регистру даже если исходный roomId уже содержит буквы в нижнем регистре', () => {
    expect(formatRoomCode('ab12cdef-0000-4000-8000-000000000000')).toBe('RM-AB12');
  });

  it('пустой/отсутствующий roomId → пустая строка (не бросает, не подставляет плейсхолдер)', () => {
    expect(formatRoomCode('')).toBe('');
    expect(formatRoomCode(undefined)).toBe('');
  });

  it('SEC-14: не мутирует и не возвращает исходный roomId — вход как ключ поиска использовать нельзя', () => {
    const roomId = '11111111-2222-4333-8444-555555555555';
    const code = formatRoomCode(roomId);

    expect(roomId).toBe('11111111-2222-4333-8444-555555555555'); // не мутирован
    expect(code).not.toBe(roomId);
    expect(code).not.toContain(roomId);
    expect(code.length).toBe(7); // 'RM-' + 4 символа, не полный UUID
  });

  it('два разных roomId с одинаковыми первыми 4 hex-символами дают одинаковый код — допустимая коллизия отображения (addendum §5.2), не идентификатор', () => {
    const a = formatRoomCode('4f2a1111-0000-4000-8000-000000000000');
    const b = formatRoomCode('4f2a2222-0000-4000-8000-000000000000');
    expect(a).toBe(b);
  });
});
