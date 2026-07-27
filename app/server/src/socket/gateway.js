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
      const origin = req.headers.origin;
      const isAllowed = allowedOrigin === '*' || origin === allowedOrigin;
      callback(null, isAllowed);
    },
  });

  return io;
}
