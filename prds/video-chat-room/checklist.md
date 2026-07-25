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

### [ ] Задача 4 — Валидация и санитизация ввода (SEC-01/02/03) — critical: YES
- [x] Тесты написаны и падают (red) — `test-author` (25 кейсов в 2 файлах: `app/server/tests/lib/validate.test.js` — 18 кейсов `validateName`/`validateText` (валидные/невалидные, границы NAME_MAX/MESSAGE_MAX, пусто/пробелы, control-chars, не-строки, XSS-отклонение), `app/server/tests/lib/sanitize.test.js` — 7 кейсов `sanitize` (нейтрализация `<img onerror>`/`<script>`/`javascript:`/`svg onload`, инвариант «нет сырых `<`/`>`», безопасный текст, идемпотентность). Red-прогон: обе сюиты падают на отсутствии `src/lib/validate.js` и `src/lib/sanitize.js`; проверено стаб-прогоном, что при наличии модулей тесты корректно дискриминируют поведение.)
- [x] Отчёт по тестам предоставлен пользователю
- [x] ⛔ ОЖИДАНИЕ КОМАНДЫ пользователя на реализацию — команда получена явно (реализация задачи 4.2 разрешена пользователем)
- [x] Код написан, тесты зелёные — `implementer` (`app/server/src/lib/validate.js` — `validateName`/`validateText`; `app/server/src/lib/sanitize.js` — `sanitize`, HTML-entity-экранирование `& < > " '`. Тесты НЕ менялись. Полный прогон монорепо: 62/62 vitest зелёные (server 61, client 1), lint (`server`+`client`) чист. Покрытие `src/lib/*` замерено локально через временный `@vitest/coverage-v8` (не добавлен в зависимости): `validate.js` 100% stmt/branch/func/line; `sanitize.js` 94.87% stmt/line, 100% func, 66.66% branch (порог ≥90% по критерию приёмки выполнен по stmt/line) — не покрыта ветка non-string guard в `sanitize` (защитный код, не пользовательский путь).)
- [x] Code review пройден — `code-reviewer` (формальное ревью hardening-кода C0/C1+zero-width strip; вердикт **PASS**; тесты 37/37 lib и 73/73 монорепо зелёные, lint чист; 3 minor: (1) `CONTROL_CHARS_RE` сохранял `\r` (0x0D), не упомянутый в JSDoc (только `\t`/`\n`) и не покрытый тестом — исправлено: JSDoc теперь фиксирует сохранение `\r` как часть `\r\n`, добавлен тест на `Line\r\nBreak`; (2) JSDoc модуля отделён от `sanitize` двумя const-объявлениями — cosmetic, не блокирует; (3) informational — `sanitize` может вернуть пустую строку из непустого валидированного ввода, ре-валидации после sanitize нет (wiring — задача 11/12, вне скоупа). Прогон после фикса (1): `npx vitest run tests/lib` 38/38 зелёные, `npm run lint --workspaces` чист.)
  - Post-review (test-first): `code-reviewer` (high) нашёл реальные баги в `sanitize.js`. `test-author` добавил регрессионные тесты в `app/server/tests/lib/sanitize.test.js` (существующие НЕ менялись): Находка 1 — 4 кейса (entity-escaping `&#39;`/`&amp;`/`&quot;`/`&lt;`/`&gt;` портит рендер в React text-node, SEC-04/Design §7.4), Находка 2 — 1 кейс (голый `javascript:` не нейтрализуется, Plan 4.1), Находка 4 — 1 кейс (coverage не-строковых аргументов). Red-прогон (`npx vitest run tests/lib`): Находки 1 и 2 падают (5 assertions red) — баги подтверждены; Находка 4 зелёная (закрывает дыру покрытия). Инвариант «нет сырых `<`/`>`» остаётся зелёным. Следующий шаг — `implementer` зазеленяет тесты, НЕ меняя их.
  - Post-review fix (`implementer`): переписан `lib/sanitize.js` — стратегия HTML-entity-экранирования заменена на strip. `<`/`>` удаляются из строки (не превращаются в `&lt;`/`&gt;`) — единственные символы, из которых можно собрать активный тег; `&`/`"`/`'` больше НЕ экранируются (безопасны в контексте React text-node, Design §7.4/SEC-04) — устраняет Находку 1. Голая `javascript:`-схема нейтрализуется удалением `:` после слова `javascript` (case-insensitive), не выходя за рамки исходной строки визуально — устраняет Находку 2. Находка 4 (guard для не-строковых аргументов) осталась без изменений, тест зелёный. JSDoc модуля обновлён под новую стратегию. Заодно устранена Находка 6 (cleanup, low): из `lib/validate.js` удалён мёртвый код `CONTROL_CHARS_RE` (полностью дублировался allow-list `NAME_ALLOWED_RE`, оба давали код `invalid-chars`). Находка 5 (doc, low): в `design-video-chat-room.md` строка сигнатуры `lib/validate.js` исправлена с `{ok,value|error}` на `{ok,value|code}` (реализация никогда не возвращает `error`). Тесты (`validate.test.js`, `sanitize.test.js`) НЕ менялись. Прогон `npm run test --workspaces`: 68/68 vitest зелёные (server 67, client 1); `npm run lint --workspaces`: чист (server+client). Находка 3 (bidi-override) сознательно НЕ фиксилась — вне заявленного скоупа SEC-01/02/03 этого раунда, оставлена пользователю на будущее решение.
  - Round 2 (`/code-review` high, 8 углов × verify): 1 находка CONFIRMED в `lib/sanitize.js:40` — нейтрализация голой `javascript:`-схемы (введённая для Находки 2) искажала безопасный текст, содержащий эту подстроку (напр. «I love javascript: it's my favorite language» → теряла двоеточие), и не давала реальной защиты (единственный потребитель — React text-node, SEC-04, где строка не интерпретируется как URI; при этом паттерн тривиально обходился бы, если бы URI-контекст когда-либо появился). Найдено сразу тремя независимыми углами (line-by-line, simplification, altitude) — сошлись на одном выводе. Фикс: `.replace(/javascript:/gi, ...)` убран из `sanitize()`, JSDoc обновлён; тест «Находка 2» в `sanitize.test.js` переписан — теперь проверяет, что голая `javascript:`-подстрока НЕ искажается (инвариант «нет сырых `<`/`>`» остаётся единственной и достаточной защитой в этом контексте). Прогон `npx vitest run tests/lib`: 32/32 зелёные; `npm run lint --workspaces`: чист.
- [x] ⛔ Security review ПРОЙДЕН — `security-auditor` (PASS; без находок critical/high; повторный аудит после hardening; маркер `.gates/security-f0868b1.ok` обновлён)
  - `/security-audit` (задача 4, SEC-01/02/03, critical): вердикт **PASS**. Проверено по `security/security-baseline.md` §7 и Design §10.1. SEC-01 (allow-list `/^[\p{L}\p{N} '\-.]+$/u`, trim, ≤NAME_MAX=30, non-string guard, отклонение control-chars/XSS) — covered; SEC-02 (trim, непусто, ≤MESSAGE_MAX=500, non-string guard) — covered; SEC-03 (`sanitize` strip `<`/`>` — достаточно для задокументированного React text-node контекста, идемпотентно) — covered в рамках серверного скоупа. ReDoS: regex линейные, catastrophic backtracking нет. Секретов нет; новых npm-зависимостей нет (`npm audit --omit=dev`: 0 vuln). Тесты 32/32 зелёные, lint чист. Находок critical/high — нет; 3 low (control-chars/zero-width в text, остаточный XSS-риск вне text-node → задача 28) и подтверждение осознанно отложенной Находки 3 (bidi). Маркер `.gates/security-f0868b1.ok` (создан для HEAD на момент аудита).
  - **Повторный аудит (после hardening, HEAD f0868b1)**: вердикт **PASS**. Новое с прошлого PASS — strip C0/C1 control-chars (`CONTROL_CHARS_RE`) и zero-width (`ZERO_WIDTH_RE`) в `sanitize.js`; закрывает low-находки 1/2 прошлого аудита. Обе новые regex — простые классы символов с флагом `g`, без вложенных квантификаторов → ReDoS невозможен (линейный проход по строке, ограниченной ≤MESSAGE_MAX=500 валидатором до вызова sanitize). `\r` сохраняется в составе `\r\n` (JSDoc/тест согласованы). SEC-01/02/03 остаются covered. Секретов нет; новых зависимостей нет (`npm audit --omit=dev`: 0 vuln). `tests/lib`: 38/38 зелёные; `eslint src/lib/*`: чист. Находок critical/high — **нет**; остаточные low (bidi-override — Находка 3, осознанно отложена вне скоупа; XSS-риск вне text-node — задача 28) не блокируют. Маркер `.gates/security-f0868b1.ok` обновлён под текущее состояние кода. Вливание задачи 4 разблокировано.
  - Hardening по low-находкам аудита (`implementer`, вне формального test-first гейта — некритичные доработки по прямой команде пользователя «запусти исправления замечаний»): в `sanitize.js` добавлен strip C0/C1 control-chars (`\x00`-`\x1F` кроме `\t`/`\n`, `\x7F`-`\x9F`) и zero-width-символов (U+200B/U+200C/U+200D/U+FEFF/U+2060) — закрывает low-находки 1 и 2 из аудита. Bidi-override (U+200E/U+200F, U+202A-U+202E) сознательно НЕ тронут — Находка 3 вне скоупа. Добавлены тесты в `sanitize.test.js` (5 новых кейсов, 19 итого в файле). ESLint потребовал `eslint-disable-next-line` для `no-control-regex`/`no-misleading-character-class` на обеих regex-константах — добавлены с обоснованием. Прогон `npx vitest run tests/lib`: 37/37 зелёные; `npm run lint --workspaces`: чист.
  - **Гейт сброшен**: код изменился после PASS-вердикта выше (маркер `.gates/security-f0868b1.ok` относится к состоянию ДО hardening-правок) — по правилу «новый код → повторный аудит» требуется свежий `/security-audit` перед PR/мержем, несмотря на то что доработки closes low-находки того же аудита.
- [ ] PR в `develop` открыт

### [ ] Задача 5 — Rate-limit token-bucket (SEC-05) — critical: YES
- [ ] Тесты написаны и падают (red) — `test-author`
- [ ] Отчёт по тестам предоставлен пользователю
- [ ] ⛔ ОЖИДАНИЕ КОМАНДЫ пользователя на реализацию
- [ ] Код написан, тесты зелёные — `implementer`
- [ ] Code review пройден — `code-reviewer`
- [ ] ⛔ Security review ПРОЙДЕН — `security-auditor` (строго перед PR/мержем)
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
