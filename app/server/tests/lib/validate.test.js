/**
 * Юнит-тесты серверной валидации ввода — `lib/validate.js`.
 *
 * Test-first (red): модуль `src/lib/validate.js` ещё НЕ существует —
 * реализацию пишет `implementer` (задача 4.2). Эти тесты — исполняемая
 * спецификация контракта.
 *
 * Контракт (TDD §4.1, §10.1):
 *   validateName(raw) -> { ok: true, value } | { ok: false, ... }
 *   validateText(raw) -> { ok: true, value } | { ok: false, ... }
 *
 * Соглашение результата совпадает с уже принятым в кодовой базе
 * (`RoomRegistry.getOrCreate`): успех — `{ ok: true, value }`, отказ —
 * `{ ok: false }` с полем-причиной. Имя поля-причины (`error`/`code`) не
 * пиннится жёстко — проверяется лишь наличие причины у отказа.
 *
 * Requirements: F-38, F-39, US-1, US-8, SEC-01, SEC-02, SEC-03.
 * Design: §4.1, §7.4, §8, §10.1. Plan: задача 4.1.
 */
import { describe, it, expect } from 'vitest';
import { validateName, validateText } from '../../src/lib/validate.js';
import { NAME_MAX, MESSAGE_MAX } from '../../src/config.js';

/** Причина отказа: поддерживаем оба возможных имени поля (`error`/`code`). */
function rejectionReason(result) {
  return result.error ?? result.code;
}

/** XSS-пейлоады из критериев приёмки задачи 4 (SEC-03). */
const XSS_PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  'javascript:alert(1)',
  '"><svg/onload=alert(1)>',
  '<a href="javascript:alert(1)">click</a>',
];

describe('validateName (SEC-01, F-38, US-1; Design §10.1)', () => {
  describe('валидные имена', () => {
    it('принимает обычное кириллическое имя и возвращает его в value', () => {
      const result = validateName('Алекс');
      expect(result.ok).toBe(true);
      expect(result.value).toBe('Алекс');
    });

    it('принимает латиницу с пробелом и цифрами', () => {
      expect(validateName('John Doe').ok).toBe(true);
      expect(validateName('User 123').ok).toBe(true);
    });

    it('обрезает окружающие пробелы (trim) до сохранения value', () => {
      const result = validateName('  Алекс  ');
      expect(result.ok).toBe(true);
      expect(result.value).toBe('Алекс');
    });

    it('принимает имя ровно на границе длины NAME_MAX', () => {
      const exact = 'a'.repeat(NAME_MAX);
      const result = validateName(exact);
      expect(result.ok).toBe(true);
      expect(result.value).toBe(exact);
    });
  });

  describe('невалидные имена', () => {
    it('отклоняет пустую строку', () => {
      const result = validateName('');
      expect(result.ok).toBe(false);
      expect(result.value).toBeUndefined();
      expect(rejectionReason(result)).toBeTruthy();
    });

    it('отклоняет строку только из пробелов (пусто после trim)', () => {
      expect(validateName('   ').ok).toBe(false);
      expect(validateName('\t \n').ok).toBe(false);
    });

    it('отклоняет имя длиной NAME_MAX + 1 (за границей)', () => {
      const tooLong = 'a'.repeat(NAME_MAX + 1);
      const result = validateName(tooLong);
      expect(result.ok).toBe(false);
      expect(result.value).toBeUndefined();
    });

    it('отклоняет управляющие символы (control characters)', () => {
      expect(validateName('Bad\x00Name').ok).toBe(false);
      expect(validateName('Line\nBreak').ok).toBe(false);
      expect(validateName('Tab\tHere').ok).toBe(false);
      expect(validateName('Esc\x1bSeq').ok).toBe(false);
    });

    it('отклоняет не-строковый ввод (защита от битого payload)', () => {
      expect(validateName(undefined).ok).toBe(false);
      expect(validateName(null).ok).toBe(false);
      expect(validateName(123).ok).toBe(false);
      expect(validateName({}).ok).toBe(false);
      expect(validateName(['Алекс']).ok).toBe(false);
    });

    it('отклоняет XSS-пейлоады в имени (allow-list символов, SEC-01/03)', () => {
      for (const payload of XSS_PAYLOADS) {
        const result = validateName(payload);
        expect(result.ok, `payload должен быть отклонён: ${payload}`).toBe(false);
        expect(result.value).toBeUndefined();
      }
    });
  });
});

describe('validateText (SEC-02, F-12/24, US-8; Design §7.4, §10.1)', () => {
  describe('валидный текст', () => {
    it('принимает непустое сообщение', () => {
      const result = validateText('Привет!');
      expect(result.ok).toBe(true);
      expect(result.value).toContain('Привет');
    });

    it('возвращает value без окружающих пробелов и непустым (непусто после trim)', () => {
      const result = validateText('  Привет мир  ');
      expect(result.ok).toBe(true);
      expect(result.value).toBe(result.value.trim());
      expect(result.value.length).toBeGreaterThan(0);
    });

    it('принимает сообщение ровно на границе длины MESSAGE_MAX', () => {
      const exact = 'a'.repeat(MESSAGE_MAX);
      const result = validateText(exact);
      expect(result.ok).toBe(true);
    });

    it('разрешает пунктуацию и спецсимволы в тексте (в отличие от имени)', () => {
      // Текст не ограничен allow-list — XSS закрывается санитизацией (SEC-03),
      // а не отклонением. Валидатор лишь проверяет непустоту и длину.
      expect(validateText('Цена: 100$ (со скидкой 20%)!').ok).toBe(true);
    });
  });

  describe('невалидный текст', () => {
    it('отклоняет пустую строку', () => {
      const result = validateText('');
      expect(result.ok).toBe(false);
      expect(result.value).toBeUndefined();
      expect(rejectionReason(result)).toBeTruthy();
    });

    it('отклоняет текст только из пробелов/переводов строк', () => {
      expect(validateText('    ').ok).toBe(false);
      expect(validateText('\n\t  \r').ok).toBe(false);
    });

    it('отклоняет сообщение длиной MESSAGE_MAX + 1 (за границей)', () => {
      const tooLong = 'a'.repeat(MESSAGE_MAX + 1);
      const result = validateText(tooLong);
      expect(result.ok).toBe(false);
      expect(result.value).toBeUndefined();
    });

    it('отклоняет не-строковый ввод (защита от битого payload)', () => {
      expect(validateText(undefined).ok).toBe(false);
      expect(validateText(null).ok).toBe(false);
      expect(validateText(42).ok).toBe(false);
      expect(validateText({ text: 'hi' }).ok).toBe(false);
    });
  });
});
