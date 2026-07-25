/**
 * Юнит-тесты санитизации контента — `lib/sanitize.js`.
 *
 * Test-first (red): модуль `src/lib/sanitize.js` ещё НЕ существует —
 * реализацию пишет `implementer` (задача 4.2).
 *
 * Контракт (TDD §4.1, §10.1 SEC-03):
 *   sanitize(str) -> str   // нейтрализация опасного контента ДО хранения
 *                          // в истории и ретрансляции (экранирование ИЛИ
 *                          // удаление опасных символов).
 *
 * Ключевой инвариант безопасности (критерий приёмки задачи 4): ни один
 * XSS-payload не проходит «в чистом виде» — в выводе не остаётся сырых
 * HTML-метасимволов `<` / `>`, из которых можно собрать активный тег.
 * Конкретная стратегия (escape vs strip) не пиннится — проверяется результат.
 *
 * Requirements: F-39, US-8, SEC-03. Design: §4.1, §7.4, §10.1. Plan: задача 4.1.
 */
import { describe, it, expect } from 'vitest';
import { sanitize } from '../../src/lib/sanitize.js';

/** XSS-пейлоады с активными тегами из критериев приёмки задачи 4. */
const TAG_PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg/onload=alert(1)>',
  '"><script>alert(document.cookie)</script>',
  '<a href="javascript:alert(1)">click</a>',
];

describe('sanitize (SEC-03; Design §7.4, §10.1)', () => {
  it('всегда возвращает строку', () => {
    expect(typeof sanitize('обычный текст')).toBe('string');
    expect(typeof sanitize('')).toBe('string');
  });

  it('не искажает безопасный текст (нет опасных символов — нечего менять)', () => {
    const safe = 'Привет мир 2024';
    expect(sanitize(safe)).toContain(safe);
  });

  it('нейтрализует сырые HTML-метасимволы < и > в любом пейлоаде', () => {
    for (const payload of TAG_PAYLOADS) {
      const clean = sanitize(payload);
      expect(clean, `в выводе не должно остаться сырого '<': ${payload}`).not.toMatch(/</);
      expect(clean, `в выводе не должно остаться сырого '>': ${payload}`).not.toMatch(/>/);
    }
  });

  it('делает невозможным сборку активного <script>-тега', () => {
    const clean = sanitize('<script>alert(1)</script>');
    expect(clean).not.toMatch(/<script/i);
    expect(clean).not.toMatch(/<\/script/i);
  });

  it('нейтрализует <img ... onerror> так, что тег не остаётся активным', () => {
    const clean = sanitize('<img src=x onerror=alert(1)>');
    // Сырой открывающий угол тега `<img` не должен сохраниться.
    expect(clean).not.toMatch(/<img/i);
    expect(clean).not.toMatch(/</);
  });

  it('обрабатывает пустую строку без исключений', () => {
    expect(() => sanitize('')).not.toThrow();
    expect(sanitize('')).toBe('');
  });

  it('идемпотентен: повторная санитизация уже безопасного вывода ничего не ломает', () => {
    const once = sanitize('<img src=x onerror=alert(1)>');
    const twice = sanitize(once);
    expect(twice).not.toMatch(/</);
    expect(twice).not.toMatch(/>/);
  });
});

/**
 * Регрессионные тесты после code-review задачи 4.
 *
 * Находка 1 (CONFIRMED, high). Единственный путь рендера пользовательского
 * контента — React text-node `{value}` (Design §7.4 line 511, SEC-04), который
 * показывает строку БУКВАЛЬНО и НЕ декодирует HTML-сущности. Значит вывод
 * `sanitize()` не должен содержать видимых entity-кодов (`&amp;`, `&quot;`,
 * `&#39;`, `&lt;`, `&gt;`) для обычных безопасных символов — иначе имя
 * `O'Brien` покажется как `O&#39;Brien`. Инвариант «нет сырых `<`/`>`»
 * при этом остаётся в силе (проверяется в сюите выше и НЕ меняется).
 */
describe('sanitize — рендер-безопасность text-node (Находка 1; Design §7.4, SEC-04)', () => {
  it("апостроф в тексте не превращается в видимый entity-код (`O'Brien`)", () => {
    const clean = sanitize("O'Brien");
    // React text-node покажет `&#39;` буквально — это визуальный артефакт.
    expect(clean).not.toContain('&#39;');
    expect(clean).not.toContain('&apos;');
    expect(clean).not.toContain('&#x27;');
  });

  it("амперсанд в тексте не превращается в видимый `&amp;` (`Tom & Jerry`)", () => {
    const clean = sanitize('Tom & Jerry');
    expect(clean).not.toContain('&amp;');
  });

  it('двойная кавычка в тексте не превращается в видимый `&quot;`', () => {
    const clean = sanitize('Он сказал "привет"');
    expect(clean).not.toContain('&quot;');
  });

  it('смысловые `<`/`>` в тексте не превращаются в видимые `&lt;`/`&gt;` (`5 < 10`)', () => {
    // Ожидаемо: символ либо strip, либо остаётся, но НЕ показывается как код.
    const clean = sanitize('5 < 10 > 3');
    expect(clean).not.toContain('&lt;');
    expect(clean).not.toContain('&gt;');
    // Ключевой инвариант безопасности сохраняется: сырых угловых нет.
    expect(clean).not.toMatch(/</);
    expect(clean).not.toMatch(/>/);
  });
});

/**
 * Находка 2 — ревизия после повторного code review. Первоначальная
 * нейтрализация голого `javascript:`-скоупа (удаление двоеточия) была
 * убрана: единственный потребитель — React text-node (SEC-04, §7.4), где
 * строка не интерпретируется как URI, а паттерн-специфичная защита только
 * портила безопасный текст, содержащий эту подстроку (напр.
 * «I love javascript: it's my favorite language»). Инвариант «нет сырых
 * `<`/`>`» (единственная реальная защита в этом контексте) остаётся в силе
 * и проверяется сюитой выше.
 */
describe('sanitize — javascript:-подстрока не искажает безопасный текст (Находка 2, ревизия; SEC-04)', () => {
  it('не изменяет текст, содержащий голую подстроку javascript: вне тега/атрибута', () => {
    const input = "I love javascript: it's my favorite language";
    expect(sanitize(input)).toBe(input);
  });

  it('не искажает голый javascript:alert(1) без окружающих тегов', () => {
    const input = 'javascript:alert(1)';
    expect(sanitize(input)).toBe(input);
  });
});

/**
 * Находка 4 (CONFIRMED, coverage gap). Guard `typeof str !== 'string'` не был
 * покрыт ни одним тестом. Ожидаемо ЗЕЛЁНЫЙ уже сейчас — закрывает дыру
 * в покрытии, а не фиксирует баг.
 */
describe('sanitize — не-строковые аргументы (Находка 4; coverage)', () => {
  it('возвращает пустую строку для undefined/null/number/object без исключений', () => {
    expect(sanitize(undefined)).toBe('');
    expect(sanitize(null)).toBe('');
    expect(sanitize(42)).toBe('');
    expect(sanitize({})).toBe('');
  });
});

/**
 * Hardening по итогам /security-audit задачи 4 (low, не XSS).
 *
 * validateText (в отличие от validateName) не режет control-chars/zero-width
 * allow-list'ом — их нейтрализация переложена на sanitize (единственное
 * место, куда стекаются и имя, и текст перед хранением/ретрансляцией).
 * Bidi-override-символы (Находка 3) сюда сознательно НЕ входят.
 */
describe('sanitize — control-chars и zero-width (security-audit hardening, low)', () => {
  it('удаляет C0-управляющие символы (null, ESC), кроме \\t и \\n', () => {
    expect(sanitize('Bad\x00Name')).toBe('BadName');
    expect(sanitize('Esc\x1bSeq')).toBe('EscSeq');
  });

  it('сохраняет \\t и \\n в тексте', () => {
    expect(sanitize('Tab\tHere')).toBe('Tab\tHere');
    expect(sanitize('Line\nBreak')).toBe('Line\nBreak');
  });

  it('сохраняет \\r в составе \\r\\n-перевода строки (Windows line endings)', () => {
    expect(sanitize('Line\r\nBreak')).toBe('Line\r\nBreak');
  });

  it('удаляет C1-управляющие символы (\\x7F-\\x9F)', () => {
    expect(sanitize('a\x7fb\x9fc')).toBe('abc');
  });

  it('удаляет zero-width-символы (ZWSP/ZWNJ/ZWJ/BOM/word joiner)', () => {
    expect(sanitize('a​b‌c‍d﻿e⁠f')).toBe('abcdef');
  });

  it('сообщение из одних zero-width-символов сжимается в пустую строку', () => {
    expect(sanitize('​‌‍﻿⁠')).toBe('');
  });
});
