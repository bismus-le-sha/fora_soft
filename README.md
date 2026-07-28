# video-chat-room

Видеочат-комната на 4 участников: P2P mesh (WebRTC), текстовый чат, вход по
ссылке. Монорепо на npm workspaces — `app/server` (Express + Socket.io,
состояние только в RAM) и `app/client` (Vite + React).

Продуктовые и технические детали — `prds/video-chat-room/` (PRD, TDD,
Implementation Plan). Ниже — только запуск/развёртывание.

## Требования

- Node.js 20 LTS (см. `.nvmrc`; `nvm use`, если используете nvm).
- npm (идёт с Node); workspaces настроены в корневом `package.json` —
  ставить зависимости только из корня.

```bash
npm install
```

## Dev-режим (отладка и дебаг)

Одна команда поднимает и сервер, и клиент (двумя дочерними процессами через `concurrently`):

```bash
npm run dev
```

Это запускает параллельно (`concurrently`):
- **server** — `nodemon app/server/src/index.js`, порт `3001` (env `PORT`),
  автоперезапуск при изменении файлов сервера;
- **client** — `vite` dev-сервер с HMR, порт `5173`.

Открывать **`http://127.0.0.1:5173`** (не 3001) — это Vite dev-сервер, который
проксирует `/socket.io` (включая WS-upgrade) и `/healthz` на сервер (см.
`app/client/vite.config.js`; хост зафиксирован как `127.0.0.1`, а не
`localhost`, — на Windows это избавляет от сюрпризов dual-stack IPv4/IPv6).
`127.0.0.1`/`localhost` — secure context для getUserMedia/WebRTC без TLS,
поэтому в dev сертификат не нужен.

Запуск по отдельности (два терминала), если нужно видеть логи раздельно или
перезапускать независимо:

```bash
npm run dev:server   # только сервер, порт 3001
npm run dev:client   # только клиент, порт 5173 (Vite proxy на 3001)
```

Если сервер поднят на нестандартном порту, передайте это клиенту тем же
значением через `SERVER_PORT` (используется только `vite.config.js` для
адреса прокси, не влияет на сам сервер):

```bash
PORT=4000 npm run dev:server
SERVER_PORT=4000 npm run dev:client
```

### Отладка/дебаг

- **Логи сервера** — в терминале (`nodemon`/`concurrently`, префикс `server`);
  `console.log`/`logger.js` пишут туда же. Изменения в `app/server/src/**`
  подхватываются автоперезапуском без ручного перезапуска.
- **Клиент** — обычные React DevTools + DevTools браузера; Vite даёт
  осмысленные стектрейсы и HMR без потери состояния большинства компонентов.
- **WebRTC/ICE** — `chrome://webrtc-internals` (или `about:webrtc` в Firefox)
  для инспекции ICE-кандидатов, состояния соединения, битрейта; полезно при
  диагностике проблем P2P mesh (см. TDD §7.1, §8).
- **Socket.io** — включить отладочные логи клиентской библиотеки в консоли
  браузера: `localStorage.debug = 'socket.io-client:*'` (перезагрузить
  страницу), выключить — `localStorage.removeItem('debug')`.
- **Несколько участников локально** — открыть `http://127.0.0.1:5173/room/<id>`
  в нескольких вкладках/окнах (в т.ч. режим инкогнито, чтобы не делить
  состояние вкладки); для автоматизированных сценариев без реальной
  камеры/микрофона см. E2E-тесты (`npm run test:e2e`) — используют
  `--use-fake-device-for-media-stream`.
- **`/healthz`** — `GET http://127.0.0.1:3001/healthz` → `{status:'ok', rooms: N}`,
  быстрый способ убедиться, что сервер жив и видит текущее число комнат в RAM.

### Тесты

```bash
npm test              # unit/интеграционные (vitest) — server + client
npm run test:e2e       # Playwright smoke (поднимает dev-сборку сам, см. playwright.config.js)
npm run lint           # eslint — server + client
```

## Прод: сборка и запуск

Клиент собирается статикой, сервер отдаёт её с того же origin (single-origin,
TDD §12.2) — Socket.io и статика идут по одному хосту/порту, без CORS между
клиентом и API.

```bash
npm run build                 # vite build → app/client/dist
NODE_ENV=production PORT=3001 \
ALLOWED_ORIGIN=https://<PROD_DOMAIN> \
PROD_DOMAIN=<PROD_DOMAIN> \
node app/server/src/index.js
```

Сервер в `NODE_ENV=production` дополнительно отдаёт `app/client/dist` и
SPA-фолбэк на `index.html` для клиентского роутинга (`/room/:id`), см.
`app/server/src/index.js`. Сам процесс слушает **обычный http**, без TLS —
TLS/WSS терминируется реверс-прокси перед ним (см. ниже).

### Реверс-прокси (обязателен в проде)

Node-процесс не терминирует TLS сам. Перед ним — nginx или Caddy: TLS/WSS
наружу, обычный http/ws на Node, один origin для браузера.

**nginx:**

```nginx
server {
    listen 443 ssl http2;
    server_name <PROD_DOMAIN>;

    ssl_certificate     /etc/letsencrypt/live/<PROD_DOMAIN>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<PROD_DOMAIN>/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";       # нужен для WS-апгрейда /socket.io
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name <PROD_DOMAIN>;
    return 301 https://$host$request_uri;
}
```

**Caddy** (проще — TLS/ACME из коробки):

```caddy
<PROD_DOMAIN> {
    reverse_proxy 127.0.0.1:3001
}
```

Node вызывает `app.set('trust proxy', 1)` (см. `app/server/src/index.js`) —
корректно читает `X-Forwarded-*` от прокси (реальный IP клиента для
rate-limit, `X-Forwarded-Proto` и т.д.).

**Лимит числа соединений — ответственность прокси.** Приложение ограничивает
число комнат (`ROOMS_MAX`) и участников в комнате (`ROOM_CAPACITY`), но не
общее число одновременных socket-соединений на процесс (Design §10.3). На
единственном прод-инстансе это должен ограничивать реверс-прокси, например
`limit_conn`/`limit_req` в nginx:

```nginx
limit_conn_zone $binary_remote_addr zone=perip:10m;
# внутри location /:
limit_conn perip 20;
```



### Переменные окружения (прод)

| Переменная | Назначение | По умолчанию (dev) |
|---|---|---|
| `NODE_ENV` | `production` включает раздачу статики клиента, HSTS-заголовок, отключает dev-ветки | не задано |
| `PORT` | порт, который слушает Node за прокси | `3001` |
| `ALLOWED_ORIGIN` | разрешённый origin для CORS Socket.io/HTTP (SEC-15); в проде — `https://<PROD_DOMAIN>`, **не** `*` | `http://localhost:5173` |
| `PROD_DOMAIN` | хост (без схемы) для CSP `connect-src` (`wss://<PROD_DOMAIN>`, SEC-13) | `example.com` |
| `CLIENT_DIST_DIR` | путь к собранной статике клиента, если раскладка деплоя нестандартная | `app/client/dist` |

`<PROD_DOMAIN>` — плейсхолдер, подставляется на этапе деплоя; на разработку не
влияет (dev всегда на `localhost`).

### Ограничение развёртывания: single-instance

**Ровно один Node-процесс.** Всё состояние (комнаты, участники, история чата)
живёт в RAM процесса — без Redis-adapter и без sticky-session за балансировщиком.
Несколько реплик за прокси **не поддерживаются**: участники одной комнаты
могут попасть на разные процессы и не увидеть друг друга. Горизонтальное
масштабирование — вне объёма текущей фичи (потребовало бы общего состояния,
отдельная фича).

**Rollback.** Состояние эфемерно (нет БД) — откат образа/деплоя безопасен,
активные комнаты при рестарте теряются, это ожидаемо (участники просто заходят
по ссылке заново). Health-check — `GET /healthz` (без PII), для авто-рестарта
процесса оркестратором при падении.

**Деплой** — по Git Flow: `feature/*` → PR в `develop` → `main` (релиз);
детали веток и защит — `.github/README.md`.
