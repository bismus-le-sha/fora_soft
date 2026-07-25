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

### [ ] Задача 2 — Единый config.js с константами лимитов — critical: NO
- [x] Код написан, тесты зелёные — `implementer`
- [x] Code review пройден — `code-reviewer` (вердикт PASS; 3 minor — косметика/будущие задачи)
- [ ] ⛔ Security review ПРОЙДЕН — `security-auditor` (строго перед PR/мержем)
- [ ] PR в `develop` открыт

### [ ] Задача 3 — Доменные сущности и RoomRegistry — critical: NO
- [ ] Код написан, тесты зелёные — `implementer`
- [ ] Code review пройден — `code-reviewer`
- [ ] ⛔ Security review ПРОЙДЕН — `security-auditor` (строго перед PR/мержем)
- [ ] PR в `develop` открыт

### [ ] Задача 4 — Валидация и санитизация ввода (SEC-01/02/03) — critical: YES
- [ ] Тесты написаны и падают (red) — `test-author`
- [ ] Отчёт по тестам предоставлен пользователю
- [ ] ⛔ ОЖИДАНИЕ КОМАНДЫ пользователя на реализацию
- [ ] Код написан, тесты зелёные — `implementer`
- [ ] Code review пройден — `code-reviewer`
- [ ] ⛔ Security review ПРОЙДЕН — `security-auditor` (строго перед PR/мержем)
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
