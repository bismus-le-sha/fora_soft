/**
 * Санитизация контента (имя, текст чата) ДО хранения в истории комнаты и
 * ретрансляции остальным участникам (SEC-03) — вторая линия защиты от XSS
 * поверх серверной валидации (`lib/validate.js`).
 *
 * Стратегия: УДАЛЕНИЕ (strip), а не HTML-entity-экранирование. Единственный
 * потребитель санитизированного контента на клиенте — React text-node
 * (`{value}`, Design §7.4, строка 511, SEC-04): в этом контексте нет ни
 * вставки в HTML-атрибуты, ни `dangerouslySetInnerHTML`, а сам React не
 * декодирует HTML-сущности — `&#39;` показался бы пользователю буквально.
 * Поэтому:
 *   - `<` и `>` — единственные символы, реально необходимые для сборки
 *     активного тега (`<script>`, `<img onerror>`, `<svg onload>` и т.п.) —
 *     они УДАЛЯЮТСЯ из строки, а не превращаются в видимые `&lt;`/`&gt;`;
 *   - `&`, `"`, `'` в text-node-контексте безопасны сами по себе (не
 *     позволяют собрать активный тег без `<`/`>`) — оставлены как есть, без
 *     экранирования, чтобы не портить отображение обычного текста
 *     (`O'Brien`, `Tom & Jerry`, кавычки прямой речи);
 *   - голая `javascript:`-схема НЕ нейтрализуется отдельно: в text-node-
 *     контексте она не интерпретируется как URI, а прежняя паттерн-
 *     специфичная защита (удаление двоеточия) только портила безопасный
 *     текст, содержащий эту подстроку (напр. «I love javascript: …»).
 *     Если в будущем появится потребитель, трактующий этот текст как
 *     URI/href, схему нужно проверять allow-list'ом схем в точке
 *     использования, а не паттерном в общей санитизации.
 *
 * Ключевой инвариант («нет сырых `<`/`>` в выводе») сохраняется и делает
 * функцию идемпотентной: повторный вызов над уже очищенной строкой не может
 * заново породить `<`/`>`.
 *
 * Hardening по итогам security-аудита задачи 4 (низкая severity, не XSS):
 *   - C0/C1 управляющие символы (`\x00`-`\x1F` кроме `\t`/`\n`/`\r`,
 *     `\x7F`-`\x9F`) удаляются — `validateText` (в отличие от `validateName`)
 *     не режет их allow-list'ом, а сырой control-char (напр. ANSI-escape
 *     `\x1b`) не несёт смысловой нагрузки в тексте чата. `\r` сохраняется
 *     вместе с `\n`, чтобы не ломать `\r\n`-переводы строк;
 *   - zero-width-символы (U+200B ZWSP, U+200C ZWNJ, U+200D ZWJ, U+FEFF
 *     BOM/ZWNBSP, U+2060 word joiner) удаляются — иначе сообщение из одних
 *     невидимых символов проходит `validateText` как непустое.
 * Bidi-override-символы (U+200E/U+200F, U+202A-U+202E) сюда сознательно НЕ
 * входят — Находка 3, вне скоупа SEC-01/02/03 этого раунда.
 *
 * Requirements: F-39, US-8, SEC-03, SEC-04. Design: §4.1, §7.4, §10.1.
 *
 * @param {unknown} str
 * @returns {string}
 */
// eslint-disable-next-line no-control-regex -- intentional: strip C0/C1 control chars from text
const CONTROL_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g;
// eslint-disable-next-line no-misleading-character-class -- intentional: class of invisible chars, not a composed grapheme
const ZERO_WIDTH_RE = /[\u200B\u200C\u200D\uFEFF\u2060]/g;

export function sanitize(str) {
  if (typeof str !== 'string') {
    return '';
  }

  return str
    .replace(/[<>]/g, '')
    .replace(CONTROL_CHARS_RE, '')
    .replace(ZERO_WIDTH_RE, '');
}

export default sanitize;
