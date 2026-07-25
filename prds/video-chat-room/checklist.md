# Checklist разработки — video-chat-room

> **Живой чеклист.** Обновляется на КАЖДОМ шаге любым агентом, который этот шаг
> выполняет. Гейты со знаком ⛔ — **блокирующие**: дальше нельзя без явной
> отметки, а где указано — без команды пользователя. Агент, начиная работу,
> сначала читает этот файл и сверяется с гейтами.

## Стадии фичи
- [x] Security baseline построен — `/threat-model`
- [x] TDD готов — `/design`
- [x] Implementation Plan готов — `/plan`
- [x] Секции задач ниже сгенерированы из плана

## Задачи

<!-- По одной секции на задачу плана. Для критичных включены test-first гейты.
     critical: YES/NO проставляет task-planner. -->

### [x] Задача 1 — Скаффолд монорепо (npm workspaces) — critical: NO
- [x] Код написан, тесты зелёные — `implementer`
- [x] Code review пройден — `/code-review` (high effort; findings 1–2 применены)
- [x] ⛔ Security review ПРОЙДЕН — `security-auditor` (PASS, маркер `.gates/security-b266f9d.ok`)
- [x] PR в `develop` открыт — #3

### [x] Задача 2 — Единый config.js с константами лимитов — critical: NO
- [x] Код написан, тесты зелёные — `implementer`
- [x] Code review пройден — `code-reviewer` (вердикт PASS; 3 minor — косметика/будущие задачи)
- [x] ⛔ Security review ПРОЙДЕН — `security-auditor` (PASS; без находок critical/high; маркер `.gates/security-12b8457.ok`)
- [x] PR в `develop` открыт — #4

### [x] Задача 3 — Доменные сущности и RoomRegistry — critical: NO
- [x] Код написан, тесты зелёные — `implementer` (36/36 vitest зелёные, lint чист; `Room`/`Participant`/`Message`/`RoomRegistry` в `app/server/src/domain/`)
- [x] Code review пройден — `code-reviewer` (вердикт PASS; тесты 22/22 доменных зелёные, lint чист; замечания только nit)
- [x] ⛔ Security review ПРОЙДЕН — `security-auditor` (PASS; без находок critical/high; SEC-09/10/11 covered; маркер `.gates/security-db7ff80.ok`)
- [x] PR в `develop` открыт — #6

### [x] Задача 4 — Валидация и санитизация ввода (SEC-01/02/03) — critical: YES
- [x] Тесты написаны и падают (red) — `test-author` (25 кейсов в 2 файлах: `app/server/tests/lib/validate.test.js` — 18 кейсов `validateName`/`validateText` (валидные/невалидные, границы NAME_MAX/MESSAGE_MAX, пусто/пробелы, control-chars, не-строки, XSS-отклонение), `app/server/tests/lib/sanitize.test.js` — 7 кейсов `sanitize` (нейтрализация `<img onerror>`/`<script>`/`javascript:`/`svg onload`, инвариант «нет сырых `<`/`>`», безопасный текст, идемпотентность). Red-прогон: обе сюиты падают на отсутствии `src/lib/validate.js` и `src/lib/sanitize.js`; проверено стаб-прогоном, что при наличии модулей тесты корректно дискриминируют поведение.)
- [x] Отчёт по тестам предоставлен пользователю
- [x] ⛔ ОЖИДАНИЕ КОМАНДЫ пользователя на реализацию — команда получена явно (реализация задачи 4.2 разрешена пользователем)
- [x] Код написан, тесты зелёные — `implementer` (`app/server/src/lib/validate.js` — `validateName`/`validateText`; `app/server/src/lib/sanitize.js` — `sanitize`, HTML-entity-экранирование `& < > " '`. Тесты НЕ менялись. Полный прогон монорепо: 62/62 vitest зелёные (server 61, client 1), lint (`server`+`client`) чист. Покрытие `src/lib/*` замерено локально через временный `@vitest/coverage-v8` (не добавлен в зависимости): `validate.js` 100% stmt/branch/func/line; `sanitize.js` 94.87% stmt/line, 100% func, 66.66% branch (порог ≥90% по критерию приёмки выполнен по stmt/line) — не покрыта ветка non-string guard в `sanitize` (защитный код, не пользовательский путь).)
- [x] Code review пройден — `code-reviewer` (формальное ревью hardening-кода C0/C1+zero-width strip; вердикт **PASS**; тесты 37/37 lib и 73/73 монорепо зелёные, lint чист; 3 minor: (1) `CONTROL_CHARS_RE` сохранял `\r` (0x0D), не упомянутый в JSDoc (только `\t`/`\n`) и не покрытый тестом — исправлено: JSDoc теперь фиксирует сохранение `\r` как часть `\r\n`, добавлен тест на `Line\r\nBreak`; (2) JSDoc модуля отделён от `sanitize` двумя const-объявлениями — cosmetic, не блокирует; (3) informational — `sanitize` может вернуть пустую строку из непустого валидированного ввода, ре-валидации после sanitize нет (wiring — задача 11/12, вне скоупа). Прогон после фикса (1): `npx vitest run tests/lib` 38/38 зелёные, `npm run lint --workspaces` чист.)
  - Post-review (test-first): `code-reviewer` (high) нашёл реальные баги в `sanitize.js`. `test-author` добавил регрессионные тесты в `app/server/tests/lib/sanitize.test.js` (существующие НЕ менялись): Находка 1 — 4 кейса (entity-escaping `&#39;`/`&amp;`/`&quot;`/`&lt;`/`&gt;` портит рендер в React text-node, SEC-04/Design §7.4), Находка 2 — 1 кейс (голый `javascript:` не нейтрализуется, Plan 4.1), Находка 4 — 1 кейс (coverage не-строковых аргументов). Red-прогон (`npx vitest run tests/lib`): Находки 1 и 2 падают (5 assertions red) — баги подтверждены; Находка 4 зелёная (закрывает дыру покрытия). Инвариант «нет сырых `<`/`>`» остаётся зелёным. Следующий шаг — `implementer` зазеленяет тесты, НЕ меняя их.
  - Post-review fix (`implementer`): переписан `lib/sanitize.js` — стратегия HTML-entity-экранирования заменена на strip. `<`/`>` удаляются из строки (не превращаются в `&lt;`/`&gt;`) — единственные символы, из которых можно собрать активный тег; `&`/`"`/`'` больше НЕ экранируются (безопасны в контексте React text-node, Design §7.4/SEC-04) — устраняет Находку 1. Голая `javascript:`-схема нейтрализуется удалением `:` после слова `javascript` (case-insensitive), не выходя за рамки исходной строки визуально — устраняет Находку 2. Находка 4 (guard для не-строковых аргументов) осталась без изменений, тест зелёный. JSDoc модуля обновлён под новую стратегию. Заодно устранена Находка 6 (cleanup, low): из `lib/validate.js` удалён мёртвый код `CONTROL_CHARS_RE` (полностью дублировался allow-list `NAME_ALLOWED_RE`, оба давали код `invalid-chars`). Находка 5 (doc, low): в `design-video-chat-room.md` строка сигнатуры `lib/validate.js` исправлена с `{ok,value|error}` на `{ok,value|code}` (реализация никогда не возвращает `error`). Тесты (`validate.test.js`, `sanitize.test.js`) НЕ менялись. Прогон `npm run test --workspaces`: 68/68 vitest зелёные (server 67, client 1); `npm run lint --workspaces`: чист (server+client). Находка 3 (bidi-override) сознательно НЕ фиксилась — вне заявленного скоупа SEC-01/02/03 этого раунда, оставлена пользователю на будущее решение.
  - Round 2 (`/code-review` high, 8 углов × verify): 1 находка CONFIRMED в `lib/sanitize.js:40` — нейтрализация голой `javascript:`-схемы (введённая для Находки 2) искажала безопасный текст, содержащий эту подстроку (напр. «I love javascript: it's my favorite language» → теряла двоеточие), и не давала реальной защиты (единственный потребитель — React text-node, SEC-04, где строка не интерпретируется как URI; при этом паттерн тривиально обходился бы, если бы URI-контекст когда-либо появился). Найдено сразу тремя независимыми углами (line-by-line, simplification, altitude) — сошлись на одном выводе. Фикс: `.replace(/javascript:/gi, ...)` убран из `sanitize()`, JSDoc обновлён; тест «Находка 2» в `sanitize.test.js` переписан — теперь проверяет, что голая `javascript:`-подстрока НЕ искажается (инвариант «нет сырых `<`/`>`» остаётся единственной и достаточной защитой в этом контексте). Прогон `npx vitest run tests/lib`: 32/32 зелёные; `npm run lint --workspaces`: чист.
- [x] ⛔ Security review ПРОЙДЕН — `security-auditor` (PASS; без находок critical/high; финальный маркер `.gates/security-bed6eeb.ok`, rebind под коммит после закрытия задачи 4)
  - `/security-audit` (задача 4, SEC-01/02/03, critical): вердикт **PASS**. Проверено по `security/security-baseline.md` §7 и Design §10.1. SEC-01 (allow-list `/^[\p{L}\p{N} '\-.]+$/u`, trim, ≤NAME_MAX=30, non-string guard, отклонение control-chars/XSS) — covered; SEC-02 (trim, непусто, ≤MESSAGE_MAX=500, non-string guard) — covered; SEC-03 (`sanitize` strip `<`/`>` — достаточно для задокументированного React text-node контекста, идемпотентно) — covered в рамках серверного скоупа. ReDoS: regex линейные, catastrophic backtracking нет. Секретов нет; новых npm-зависимостей нет (`npm audit --omit=dev`: 0 vuln). Тесты 32/32 зелёные, lint чист. Находок critical/high — нет; 3 low (control-chars/zero-width в text, остаточный XSS-риск вне text-node → задача 28) и подтверждение осознанно отложенной Находки 3 (bidi). Маркер `.gates/security-f0868b1.ok` (создан для HEAD на момент аудита).
  - **Повторный аудит (после hardening, HEAD f0868b1)**: вердикт **PASS**. Новое с прошлого PASS — strip C0/C1 control-chars (`CONTROL_CHARS_RE`) и zero-width (`ZERO_WIDTH_RE`) в `sanitize.js`; закрывает low-находки 1/2 прошлого аудита. Обе новые regex — простые классы символов с флагом `g`, без вложенных квантификаторов → ReDoS невозможен (линейный проход по строке, ограниченной ≤MESSAGE_MAX=500 валидатором до вызова sanitize). `\r` сохраняется в составе `\r\n` (JSDoc/тест согласованы). SEC-01/02/03 остаются covered. Секретов нет; новых зависимостей нет (`npm audit --omit=dev`: 0 vuln). `tests/lib`: 38/38 зелёные; `eslint src/lib/*`: чист. Находок critical/high — **нет**; остаточные low (bidi-override — Находка 3, осознанно отложена вне скоупа; XSS-риск вне text-node — задача 28) не блокируют. Маркер `.gates/security-f0868b1.ok` обновлён под текущее состояние кода. Вливание задачи 4 разблокировано.
  - Hardening по low-находкам аудита (`implementer`, вне формального test-first гейта — некритичные доработки по прямой команде пользователя «запусти исправления замечаний»): в `sanitize.js` добавлен strip C0/C1 control-chars (`\x00`-`\x1F` кроме `\t`/`\n`, `\x7F`-`\x9F`) и zero-width-символов (U+200B/U+200C/U+200D/U+FEFF/U+2060) — закрывает low-находки 1 и 2 из аудита. Bidi-override (U+200E/U+200F, U+202A-U+202E) сознательно НЕ тронут — Находка 3 вне скоупа. Добавлены тесты в `sanitize.test.js` (5 новых кейсов, 19 итого в файле). ESLint потребовал `eslint-disable-next-line` для `no-control-regex`/`no-misleading-character-class` на обеих regex-константах — добавлены с обоснованием. Прогон `npx vitest run tests/lib`: 37/37 зелёные; `npm run lint --workspaces`: чист.
  - **Гейт сброшен**: код изменился после PASS-вердикта выше (маркер `.gates/security-f0868b1.ok` относится к состоянию ДО hardening-правок) — по правилу «новый код → повторный аудит» требуется свежий `/security-audit` перед PR/мержем, несмотря на то что доработки closes low-находки того же аудита.
  - **Rebind-аудит (коммит 908bb64)**: вердикт **PASS**. Hardening-код закоммичен без изменений содержимого — подтверждено: `git diff f0868b1..HEAD -- app/server/src/lib` содержит только new-file добавления (файлы `validate.js`/`sanitize.js` были untracked во время аудита working-tree, коммит зафиксировал их дословно), diff `tests/lib` — только добавления, ни один тест не изменён. Контроль: `npx vitest run tests/lib` 38/38 зелёные; `npm run lint --workspaces` чист. Содержимое идентично уже проверенному PASS-состоянию, находок critical/high нет. Прежний маркер `.gates/security-f0868b1.ok` относится к до-коммитному HEAD; создан свежий `.gates/security-908bb64.ok` под этот коммит.
  - **Rebind-аудит (финальный коммит bed6eeb)**: doc-коммит чеклиста (`908bb64`→`bed6eeb`) сдвинул HEAD и снова обнулил гейт, хотя код не менялся — `git diff 908bb64..HEAD --stat` показал изменения только в `checklist.md`. Механический rebind: `npx vitest run tests/lib` 38/38 зелёные, `npm run lint --workspaces` чист, вердикт **PASS**, маркер `.gates/security-bed6eeb.ok`. Чеклист в рамках этого шага НЕ редактировался (во избежание бесконечной cepочки rebind-коммитов) — эта запись добавлена отдельно, уже после `gh pr create`, когда гейт для дальнейших правок чеклиста больше не блокирует уже открытый PR. Вливание задачи 4 разблокировано.
- [x] PR в `develop` открыт — [#7](https://github.com/bismus-le-sha/fora_soft/pull/7)

### [ ] Задача 5 — Rate-limit token-bucket (SEC-05) — critical: YES
- [x] Тесты написаны и падают (red) — `test-author` (13 кейсов в `app/server/tests/lib/rateLimit.test.js` для `allow(socketId, category)`: контракт (функция/строгий boolean), burst в пределах лимита проходит + следующий отклоняется (`it.each` по chat/signal/join из `RATE_LIMIT`), граница burst = `config.RATE_LIMIT[category].points` (лимиты из config.js), флуд после исчерпания стабильно false и не бросает (F-40 «без падения»), бакет не переполняется после долгого простоя, восстановление токенов через fake timers (полное окно durationMs → полный бюджет; частичное восстановление за durationMs/points → ровно один; не мгновенно — до одного токена false), изоляция по socketId (лимит НА СОЕДИНЕНИЕ) и по категории. Лимиты не хардкодятся — читаются из `config.js`. Red-прогон: `npx vitest run tests/lib/rateLimit.test.js` → suite FAIL «Cannot find module '../../src/lib/rateLimit.js'» (падение из-за отсутствия модуля, не из-за ошибки в тесте). Корректность самого спека проверена прогоном ассертов против эталонного token-bucket в scratchpad: 30/30 pass — тесты дискриминируют поведение и станут зелёными на корректной реализации.)
- [x] Отчёт по тестам предоставлен пользователю
- [x] ⛔ ОЖИДАНИЕ КОМАНДЫ пользователя на реализацию — команда получена явно (пользователь: «5» в ответ на выбор задачи для `/implement`)
- [x] Код написан, тесты зелёные — `implementer` (`app/server/src/lib/rateLimit.js` — экспортирует `allow(socketId, category) -> boolean`; token-bucket на пару `(socketId, category)`, хранится в `Map` по ключу `${socketId}::${category}`; лимиты (`points`/`durationMs`) читаются из `RATE_LIMIT` в `config.js`, не хардкодятся; неизвестная категория → безопасный `false` без throw; рефилл — линейный по `Date.now()` (тестируем через `vi.useFakeTimers()`, мокающий именно `Date`), cap на `points` (простой не копит токены сверх burst). Тесты НЕ менялись. `npx vitest run tests/lib/rateLimit.test.js`: 13/13 зелёные. Полный прогон монорепо `npm run test --workspaces`: 88/88 зелёные (server 87, client 1); `npm run lint --workspaces`: чист (server+client). Покрытие `src/lib/rateLimit.js` замерено локально через временный `@vitest/coverage-v8` (не добавлен в зависимости, `npm ls` показывает `extraneous`): 97.01% stmt/line, 100% func, 83.33% branch (порог ≥90% по критерию приёмки выполнен по stmt/line/func) — непокрытая ветка (`!limit`, строки 49-50) — защитный код для неизвестной категории события, не задействуется тестами, покрывающими только объявленные в `RATE_LIMIT` категории (chat/signal/join).)
- [ ] Code review пройден — `/code-review` (high effort, 8 углов × verify): найдено 2 находки после дедупа. (1) CONFIRMED, `rateLimit.js:32` — module-level `buckets` Map никогда не очищается (нет eviction/TTL/dispose-хука); при churn соединений на долгоживущем single-instance сервере растёт неограниченно — риск для той же цели, ради которой сделан SEC-05 (защита от исчерпания ресурсов). (2) PLAUSIBLE, `rateLimit.js:42` — неизвестная категория и реально исчерпанный бюджет неразличимы (оба дают `false`); опечатка в будущем вызывающем коде (задача 8) будет выглядеть как перманентный rate-limit без диагностического сигнала. Вердикт по контракту задачи 5 (`allow(socketId, category) -> boolean`) технически выполнен, но находка (1) — реальный дефект вне заявленного скоупа теста, требует решения перед мержем. **Ожидает решения пользователя**: фиксить сейчас (test-author добавляет регресс-тест на eviction/dispose → implementer чинит) или сознательно отложить с пометкой в план (по аналогии с находкой 3 в задаче 4).
  - Post-review (test-first): пользователь дал команду «фиксим сейчас» по находке (1). `test-author` добавил регрессионные тесты в `app/server/tests/lib/rateLimit.test.js` (существующие 13 НЕ менялись; переиспользованы хелперы `uid()`/`callN()`/`leadingTrue()`, `RATE_LIMIT`, `vi.useFakeTimers()`). Новая сюита «rateLimit.release» — 5 кейсов, фиксирующих контракт фикса `release(socketId)` (удаляет ВСЕ бакеты соединения по всем категориям — точка вызова при дисконнекте для задач 6/8/10, устраняет утечку неограниченного роста Map): (1) `release` — функция; (2) после исчерпания бюджета `chat` и `release` — следующий `allow` снова разрешён на ПОЛНЫЙ бюджет БЕЗ advance таймеров (доступность = удаление бакета, а не временной refill); (3) один `release` очищает chat/signal/join разом; (4) `release` на неизвестном/повторном socketId — безопасный no-op, не бросает (идемпотентность); (5) изоляция — `release(a)` не трогает бакет `b`. Проверка поведенческая (Map не экспортирован, наблюдаем через `allow`). Red-прогон `npx vitest run tests/lib/rateLimit.test.js`: **5 failed | 13 passed (18)** — все 5 новых падают из-за `(0 , release) is not a function` / `typeof release === 'undefined'` (отсутствие экспорта, не ошибка в тесте); существующие 13 остаются зелёными. Следующий шаг — `implementer` зазеленяет тесты, добавив экспорт `release`, НЕ меняя сами тесты. ⛔ Ожидание команды пользователя на реализацию.
  - Post-review fix (`implementer`): добавлен экспорт `release(socketId)` в `app/server/src/lib/rateLimit.js` — удаляет из module-level `buckets` Map все ключи вида `${socketId}::${category}` для данного соединения (по всем категориям chat/signal/join за один вызов, через `String.prototype.startsWith` на префиксе `${socketId}::`); неизвестный/повторный socketId — безопасный no-op (пустой цикл, не бросает). Поведение `allow()` для чужих socketId не затронуто (изоляция сохранена — префиксное сравнение включает разделитель `::`, коллизии по общему строковому префиксу между разными id исключены). JSDoc модуля дополнен разделом «Управление памятью»: зафиксировано, что `buckets` НЕ самоочищается и `release(socketId)` предназначен для вызова будущим socket-disconnect-хендлером (задачи 6/8/10) при разрыве соединения — иначе Map растёт неограниченно на долгоживущем single-instance сервере (SEC-05/F-40). Тесты (`rateLimit.test.js`) НЕ менялись. `npx vitest run tests/lib/rateLimit.test.js`: 18/18 зелёные (13 старых + 5 новых). Полный прогон монорепо `npm run test --workspaces`: 93/93 зелёные (server 92, client 1); `npm run lint --workspaces`: чист (server+client).
  - Re-review fix: повторный прогон 8 углов (фокус на диф `release`) подтвердил корректность фикса — 3 потенциальных риска REFUTED (коллизия префикса невозможна из-за разделителя `::`; ре-энтерабельность неактуальна, Node однопоточен и `release` синхронна; `allow()` не менялся байт-в-байт). 1 CONFIRMED minor: `release` сканировала весь `buckets` Map (O(n)) вместо прямого удаления 3 известных ключей категорий (O(3), т.к. `RATE_LIMIT` уже импортирован в этом же модуле). Применён тривиальный фикс по решению пользователя: `release` переписана на `for (const category of Object.keys(RATE_LIMIT)) buckets.delete(...)`. Тесты не менялись. `npx vitest run tests/lib/rateLimit.test.js`: 18/18 зелёные; `npm run test --workspaces`: 93/93 зелёные; `npm run lint --workspaces`: чист.
- [x] Code review пройден — вердикт **PASS** после post-review фикса и re-review; находка (2) (неизвестная категория неотличима от rate-limited) сознательно оставлена как informational/вне скоупа этого раунда — корректна по заявленному контракту задачи 5 (`allow(socketId, category) -> boolean`), актуальна для будущего wiring в задаче 8.
- [x] ⛔ Security review ПРОЙДЕН — `security-auditor` (`/security-audit`), вердикт **PASS** (без находок critical/high). Аудит по baseline §7 (SEC-05) и Design §10.1/§4.1/§9.3. Проверено: (1) корректный token-bucket на пару (socketId, category) — рефилл `elapsed*points/durationMs` с cap на `points` (`rateLimit.js:70-75`), списание 1 токена/false при исчерпании (77-82); (2) лимиты берутся ТОЛЬКО из `config.js RATE_LIMIT` (`rateLimit.js:51`), не хардкодятся, `RATE_LIMIT` заморожен `Object.freeze` (`config.js:37-41`); (3) F-40 «без падения» — модуль никогда не бросает, неизвестная категория → безопасный `false` (56-58), флуд стабильно `false`; (4) `release(socketId)` (`rateLimit.js:98-102`) — удаление бакетов всех категорий соединения через `Object.keys(RATE_LIMIT)` (O(3), точные ключи), идемпотентно, no-op на неизвестном id, не бросает, изоляция сохранена (разделитель `::`); (5) DoS-раздувание `buckets` Map не эксплуатируемо клиентом (socketId выдаёт сервер; глобальный cap соединений — SEC-10/задача 6; `release` устраняет unbounded growth при churn); (6) `release` не эксплуатируем на «сброс чужого лимита» (сброс = снятие троттлинга, не понижение лимита жертвы; не подключён к клиентским событиям, штатно вызывается с доверенным серверным `socket.id`); (7) секретов/PII нет, новых зависимостей нет (`npm audit --omit=dev`: 0 vuln); (8) тесты 18/18 зелёные, eslint чист. Находки critical/high — 0. low/informational (не блокируют): L1 — `release` пока не подключён (митигация латентна до wiring в disconnect-хендлере задач 6/8/10 — там обязан вызываться `release(socket.id)`); L2 — неизвестная категория неотличима от исчерпанного бюджета (диагностика для задачи 8, не дефект безопасности). Маркер: `.gates/security-1705ca3.ok`. **ВНИМАНИЕ (rebind):** аудит проведён по working tree; `rateLimit.js`/`rateLimit.test.js` ещё не закоммичены (HEAD `1705ca3` их не содержит) — после коммита кода задачи 5 гейт сбросится, маркер нужно перепривязать к коммиту в PR (прецедент `bed6eeb`, задача 4).
  - **Rebind-аудит (коммит `f0692cc`)**: код задачи 5 закоммичен без изменения содержимого — `git diff 1705ca3..HEAD --stat` показывает только new-file добавления (`rateLimit.js`/`rateLimit.test.js` были untracked во время аудита working-tree, коммит зафиксировал их дословно) плюс правки `checklist.md`/`impl-video-chat-room.md`. Механический rebind: `npx vitest run tests/lib/rateLimit.test.js` 18/18 зелёные, `npm run test --workspaces` 93/93 зелёные, `npm run lint --workspaces` чист. Содержимое идентично уже проверенному PASS-состоянию, находок critical/high нет. Создан маркер `.gates/security-f0692cc.ok` под этот коммит. Вливание задачи 5 разблокировано.
- [ ] PR в `develop` открыт

### [ ] Задача 6 — Socket.io gateway (SEC-08, SEC-15) — critical: NO
- [ ] Код написан, тесты зелёные — `implementer`
- [ ] Code review пройден — `code-reviewer`
- [ ] ⛔ Security review ПРОЙДЕН — `security-auditor` (строго перед PR/мержем)
- [ ] PR в `develop` открыт

### [ ] Задача 7 — Secure-заголовки/CSP и обезличенный логгер (SEC-13, SEC-16) — critical: NO
- [ ] Код написан, тесты зелёные — `implementer`
- [ ] Code review пройден — `code-reviewer`
- [ ] ⛔ Security review ПРОЙДЕН — `security-auditor` (строго перед PR/мержем)
- [ ] PR в `develop` открыт

### [ ] Задача 8 — Каркас socket-хендлеров — critical: NO
- [ ] Код написан, тесты зелёные — `implementer`
- [ ] Code review пройден — `code-reviewer`
- [ ] ⛔ Security review ПРОЙДЕН — `security-auditor` (строго перед PR/мержем)
- [ ] PR в `develop` открыт

### [ ] Задача 9 — Атомарный join и лимит 4 участника (SEC-07) — critical: YES
- [ ] Тесты написаны и падают (red) — `test-author`
- [ ] Отчёт по тестам предоставлен пользователю
- [ ] ⛔ ОЖИДАНИЕ КОМАНДЫ пользователя на реализацию
- [ ] Код написан, тесты зелёные — `implementer`
- [ ] Code review пройден — `code-reviewer`
- [ ] ⛔ Security review ПРОЙДЕН — `security-auditor` (строго перед PR/мержем)
- [ ] PR в `develop` открыт

### [ ] Задача 10 — Очистка состояния комнаты при выходе/обрыве последнего (SEC-11) — critical: YES
- [ ] Тесты написаны и падают (red) — `test-author`
- [ ] Отчёт по тестам предоставлен пользователю
- [ ] ⛔ ОЖИДАНИЕ КОМАНДЫ пользователя на реализацию
- [ ] Код написан, тесты зелёные — `implementer`
- [ ] Code review пройден — `code-reviewer`
- [ ] ⛔ Security review ПРОЙДЕН — `security-auditor` (строго перед PR/мержем)
- [ ] PR в `develop` открыт

### [ ] Задача 11 — Анти-спуфинг авторства + отправка чата (SEC-06) — critical: YES
- [ ] Тесты написаны и падают (red) — `test-author`
- [ ] Отчёт по тестам предоставлен пользователю
- [ ] ⛔ ОЖИДАНИЕ КОМАНДЫ пользователя на реализацию
- [ ] Код написан, тесты зелёные — `implementer`
- [ ] Code review пройден — `code-reviewer`
- [ ] ⛔ Security review ПРОЙДЕН — `security-auditor` (строго перед PR/мержем)
- [ ] PR в `develop` открыт

### [ ] Задача 12 — История чата при позднем входе (F-14/23) — critical: YES
- [ ] Тесты написаны и падают (red) — `test-author`
- [ ] Отчёт по тестам предоставлен пользователю
- [ ] ⛔ ОЖИДАНИЕ КОМАНДЫ пользователя на реализацию
- [ ] Код написан, тесты зелёные — `implementer`
- [ ] Code review пройден — `code-reviewer`
- [ ] ⛔ Security review ПРОЙДЕН — `security-auditor` (строго перед PR/мержем)
- [ ] PR в `develop` открыт

### [ ] Задача 13 — Обработчик media:state и broadcast — critical: NO
- [ ] Код написан, тесты зелёные — `implementer`
- [ ] Code review пройден — `code-reviewer`
- [ ] ⛔ Security review ПРОЙДЕН — `security-auditor` (строго перед PR/мержем)
- [ ] PR в `develop` открыт

### [ ] Задача 14 — Ретрансляция сигналинга (offer/answer/ice) — critical: NO
- [ ] Код написан, тесты зелёные — `implementer`
- [ ] Code review пройден — `code-reviewer`
- [ ] ⛔ Security review ПРОЙДЕН — `security-auditor` (строго перед PR/мержем)
- [ ] PR в `develop` открыт

### [ ] Задача 15 — Прод-раздача статики и /healthz — critical: NO
- [ ] Код написан, тесты зелёные — `implementer`
- [ ] Code review пройден — `code-reviewer`
- [ ] ⛔ Security review ПРОЙДЕН — `security-auditor` (строго перед PR/мержем)
- [ ] PR в `develop` открыт

### [ ] Задача 16 — Клиентский config.js (ICE + URL сигналинга) — critical: NO
- [ ] Код написан, тесты зелёные — `implementer`
- [ ] Code review пройден — `code-reviewer`
- [ ] ⛔ Security review ПРОЙДЕН — `security-auditor` (строго перед PR/мержем)
- [ ] PR в `develop` открыт

### [ ] Задача 17 — Детект WebRTC и preflight-баннеры окружения — critical: NO
- [ ] Код написан, тесты зелёные — `implementer`
- [ ] Code review пройден — `code-reviewer`
- [ ] ⛔ Security review ПРОЙДЕН — `security-auditor` (строго перед PR/мержем)
- [ ] PR в `develop` открыт

### [ ] Задача 18 — signalingClient.js (обёртка socket.io-client) — critical: NO
- [ ] Код написан, тесты зелёные — `implementer`
- [ ] Code review пройден — `code-reviewer`
- [ ] ⛔ Security review ПРОЙДЕН — `security-auditor` (строго перед PR/мержем)
- [ ] PR в `develop` открыт

### [ ] Задача 19 — Энтропия room-id и StartScreen (SEC-14) — critical: YES
- [ ] Тесты написаны и падают (red) — `test-author`
- [ ] Отчёт по тестам предоставлен пользователю
- [ ] ⛔ ОЖИДАНИЕ КОМАНДЫ пользователя на реализацию
- [ ] Код написан, тесты зелёные — `implementer`
- [ ] Code review пройден — `code-reviewer`
- [ ] ⛔ Security review ПРОЙДЕН — `security-auditor` (строго перед PR/мержем)
- [ ] PR в `develop` открыт

### [ ] Задача 20 — JoinGate — вход по ссылке (имя + user-gesture) — critical: NO
- [ ] Код написан, тесты зелёные — `implementer`
- [ ] Code review пройден — `code-reviewer`
- [ ] ⛔ Security review ПРОЙДЕН — `security-auditor` (строго перед PR/мержем)
- [ ] PR в `develop` открыт

### [ ] Задача 21 — mediaController.js — getUserMedia и тумблеры — critical: NO
- [ ] Код написан, тесты зелёные — `implementer`
- [ ] Code review пройден — `code-reviewer`
- [ ] ⛔ Security review ПРОЙДЕН — `security-auditor` (строго перед PR/мержем)
- [ ] PR в `develop` открыт

### [ ] Задача 22 — PeerConnection.js — обёртка одного RTCPeerConnection — critical: NO
- [ ] Код написан, тесты зелёные — `implementer`
- [ ] Code review пройден — `code-reviewer`
- [ ] ⛔ Security review ПРОЙДЕН — `security-auditor` (строго перед PR/мержем)
- [ ] PR в `develop` открыт

### [ ] Задача 23 — MeshManager.js — directional glare-free mesh — critical: NO
- [ ] Код написан, тесты зелёные — `implementer`
- [ ] Code review пройден — `code-reviewer`
- [ ] ⛔ Security review ПРОЙДЕН — `security-auditor` (строго перед PR/мержем)
- [ ] PR в `develop` открыт

### [ ] Задача 24 — RoomScreen + хуки оркестрации — critical: NO
- [ ] Код написан, тесты зелёные — `implementer`
- [ ] Code review пройден — `code-reviewer`
- [ ] ⛔ Security review ПРОЙДЕН — `security-auditor` (строго перед PR/мержем)
- [ ] PR в `develop` открыт

### [ ] Задача 25 — VideoGrid — адаптивная сетка 1–4 плитки — critical: NO
- [ ] Код написан, тесты зелёные — `implementer`
- [ ] Code review пройден — `code-reviewer`
- [ ] ⛔ Security review ПРОЙДЕН — `security-auditor` (строго перед PR/мержем)
- [ ] PR в `develop` открыт

### [ ] Задача 26 — VideoTile — self/remote плитка — critical: NO
- [ ] Код написан, тесты зелёные — `implementer`
- [ ] Code review пройден — `code-reviewer`
- [ ] ⛔ Security review ПРОЙДЕН — `security-auditor` (строго перед PR/мержем)
- [ ] PR в `develop` открыт

### [ ] Задача 27 — ControlBar — управление и копирование ссылки — critical: NO
- [ ] Код написан, тесты зелёные — `implementer`
- [ ] Code review пройден — `code-reviewer`
- [ ] ⛔ Security review ПРОЙДЕН — `security-auditor` (строго перед PR/мержем)
- [ ] PR в `develop` открыт

### [ ] Задача 28 — ChatPanel — XSS-безопасный рендер чата (SEC-04) — critical: YES
- [ ] Тесты написаны и падают (red) — `test-author`
- [ ] Отчёт по тестам предоставлен пользователю
- [ ] ⛔ ОЖИДАНИЕ КОМАНДЫ пользователя на реализацию
- [ ] Код написан, тесты зелёные — `implementer`
- [ ] Code review пройден — `code-reviewer`
- [ ] ⛔ Security review ПРОЙДЕН — `security-auditor` (строго перед PR/мержем)
- [ ] PR в `develop` открыт

### [ ] Задача 29 — ParticipantList — актуальный состав — critical: NO
- [ ] Код написан, тесты зелёные — `implementer`
- [ ] Code review пройден — `code-reviewer`
- [ ] ⛔ Security review ПРОЙДЕН — `security-auditor` (строго перед PR/мержем)
- [ ] PR в `develop` открыт

### [ ] Задача 30 — Баннеры ошибок и состояний — critical: NO
- [ ] Код написан, тесты зелёные — `implementer`
- [ ] Code review пройден — `code-reviewer`
- [ ] ⛔ Security review ПРОЙДЕН — `security-auditor` (строго перед PR/мержем)
- [ ] PR в `develop` открыт

### [ ] Задача 31 — Крайние случаи медиа: autoplay, потеря устройства, graceful P2P — critical: NO
- [ ] Код написан, тесты зелёные — `implementer`
- [ ] Code review пройден — `code-reviewer`
- [ ] ⛔ Security review ПРОЙДЕН — `security-auditor` (строго перед PR/мержем)
- [ ] PR в `develop` открыт

### [ ] Задача 32 — E2E-smoke (Playwright, fake media) — critical: NO
- [ ] Код написан, тесты зелёные — `implementer`
- [ ] Code review пройден — `code-reviewer`
- [ ] ⛔ Security review ПРОЙДЕН — `security-auditor` (строго перед PR/мержем)
- [ ] PR в `develop` открыт

### [ ] Задача 33 — Документация запуска и развёртывания — critical: NO
- [ ] Код написан, тесты зелёные — `implementer`
- [ ] Code review пройден — `code-reviewer`
- [ ] ⛔ Security review ПРОЙДЕН — `security-auditor` (строго перед PR/мержем)
- [ ] PR в `develop` открыт

## Легенда гейтов
- ⛔ **ОЖИДАНИЕ КОМАНДЫ** — критичная задача: код НЕ пишем, пока пользователь
  явно не разрешил после отчёта по тестам.
- ⛔ **Security review** — обязателен перед любым вливанием в `develop`/`main`.
  Без него `gh pr create` / push в рабочую ветку **блокируется хуком**
  (`.claude/hooks/pre-merge-gate.js`). После PASS `security-auditor` создаёт
  маркер `.gates/security-<short-HEAD>.ok`, разблокирующий текущий коммит.
