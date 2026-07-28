/**
 * Socket.io gateway — инициализация real-time транспорта поверх http-сервера.
 *
 * Ответственность (Design §4.1, таблица компонентов):
 *  - `maxHttpBufferSize` задаётся явно из `config.js` — гигантский payload
 *    рвётся engine.io ДО того, как долетит до какого-либо хендлера события
 *    (сервер закрывает транспорт при превышении, SEC-08);
 *  - CORS/origin allow-list из `ALLOWED_ORIGIN` (единый source of truth,
 *    `config.js`, env-переменная за прокси, SEC-15). Wildcard `'*'` запрещён
 *    в проде (`NODE_ENV=production`). Проверка origin делается ДВАЖДЫ:
 *    - `cors.origin` — заголовки для браузерных preflight/handshake-запросов;
 *    - `allowRequest` — явная серверная проверка `Origin` на уровне
 *      handshake, т.к. одни CORS-заголовки не блокируют произвольного
 *      не-браузерного клиента (браузерный same-origin policy — это
 *      соглашение самого браузера, а не серверный контроль доступа).
 *
 *      **`Referer`-фолбэк (задача 32, найдено E2E в реальном Chromium):**
 *      настоящий браузер НЕ шлёт заголовок `Origin` на простой same-origin
 *      `GET` — а именно так выглядит самый первый запрос engine.io
 *      (транспорт `polling`, до апгрейда на `websocket`, который `Origin`
 *      шлёт всегда). В зафиксированной single-origin топологии (Design
 *      §3.2/§12.2 — Vite-прокси в dev, реверс-прокси в проде) это ровно
 *      штатный путь входа: без фолбэка `allowRequest` отклонял бы КАЖДОЕ
 *      легитимное браузерное соединение на первом же handshake (страница
 *      всегда получала бы «Ошибка сервера»). Интеграционные тесты этого не
 *      ловили — `socket.io-client` в Node (в отличие от браузера) сам не
 *      добавляет `Origin`/`Referer`, тесты явно подставляют `Origin` через
 *      `extraHeaders` (см. `gateway.test.js`), поэтому реальное поведение
 *      браузера не было покрыто до сквозного E2E. Фолбэк: если `Origin`
 *      отсутствует — сверяем `origin` заголовка `Referer` (тоже клиентское
 *      соглашение, не более и не менее подделываемое, чем сам `Origin`, см.
 *      абзац выше) с `ALLOWED_ORIGIN`; при отсутствии ОБОИХ заголовков —
 *      отказ (fail-closed, без изменений к прежнему поведению).
 *  - WSS: в проде транспорт всегда идёт поверх TLS, терминируемого
 *    реверс-прокси (модель single-origin за прокси, SEC-12, Design §10.3/
 *    §10.4). Gateway не терминирует TLS сам и не хардкодит протокол —
 *    это ответственность инфраструктуры/деплоя (см. `app.set('trust proxy')`
 *    в `index.js` и README по деплою, задача 33).
 *  - Точка регистрации хендлеров намеренно НЕ вызывается здесь: сами
 *    хендлеры socket-событий (`join`, `chat:send`, `signal:*`, …) добавляются
 *    в `socket/handlers.js` (задача 8), который подпишется на
 *    `io.on('connection', ...)` отдельно, используя `io`, возвращённый этой
 *    функцией. `gateway.js` целенаправленно не импортирует ещё
 *    не существующий модуль хендлеров.
 *
 * Requirements: SEC-08, SEC-12, SEC-15. Design: §4.1, §6, §9.3, §10.3, §10.4.
 */
import { Server } from 'socket.io';
import { isProduction as isProductionEnv } from '../config.js';

/**
 * Извлекает `origin` (`scheme://host[:port]`) из значения заголовка
 * `Referer`. Некорректный/отсутствующий `Referer` не бросает — возвращает
 * `null` (см. использование в `allowRequest` ниже: null просто не совпадёт
 * ни с одним `ALLOWED_ORIGIN`, fail-closed).
 * @param {string | undefined} referer
 * @returns {string | null}
 */
function originOfReferer(referer) {
  if (!referer) {
    return null;
  }
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

/**
 * @param {import('node:http').Server} httpServer - HTTP-сервер (напр. из `index.js`), поверх которого поднимается Socket.io.
 * @param {{ALLOWED_ORIGIN: string, MAX_HTTP_BUFFER_SIZE: number}} config - обычно весь модуль `config.js`
 *   (`import * as config from '../config.js'`) — лимиты и origin ЧИТАЮТСЯ отсюда, а не хардкодятся в gateway.
 * @returns {Server} инициализированный экземпляр Socket.io-сервера.
 * @throws {Error} если `ALLOWED_ORIGIN === '*'` и `process.env.NODE_ENV === 'production'` (SEC-15).
 */
export function createGateway(httpServer, config) {
  const { ALLOWED_ORIGIN: allowedOrigin, MAX_HTTP_BUFFER_SIZE: maxHttpBufferSize } = config;

  if (allowedOrigin === '*' && isProductionEnv()) {
    throw new Error(
      'ALLOWED_ORIGIN="*" запрещён в проде (SEC-15) — задайте конкретный прод-origin через env.',
    );
  }

  const io = new Server(httpServer, {
    maxHttpBufferSize,
    cors: {
      origin: allowedOrigin,
      methods: ['GET', 'POST'],
    },
    allowRequest(req, callback) {
      if (allowedOrigin === '*') {
        callback(null, true);
        return;
      }
      const origin = req.headers.origin;
      if (origin !== undefined) {
        callback(null, origin === allowedOrigin);
        return;
      }
      // `Origin` отсутствует — реальный браузер на самом первом (polling)
      // handshake его не шлёт для same-origin запроса (см. JSDoc модуля).
      // Фолбэк на `Referer`, а не безусловный allow: не-браузерный клиент
      // без обоих заголовков по-прежнему отклоняется.
      callback(null, originOfReferer(req.headers.referer) === allowedOrigin);
    },
  });

  return io;
}
