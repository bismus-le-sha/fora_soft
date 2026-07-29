import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import * as config from './config.js';
import { createSecurityHeadersMiddleware } from './security/headers.js';
import { createGateway } from './socket/gateway.js';
import { registerHandlers } from './socket/handlers.js';
import { RoomRegistry } from './domain/RoomRegistry.js';
import logger from './logger.js';

const { PORT, CLIENT_DIST_DIR } = config;

/**
 * Собирает Express-приложение: `/healthz` (без PII, Design §12.4) + прод-раздача
 * статики клиента (Design §3.2/§12.2, SEC-12/15). Вынесено в фабрику (а не
 * построено инлайн на модульном уровне) по тому же принципу, что
 * `security/headers.js`/`socket/gateway.js` — параметр `isProduction`
 * позволяет юнит-тестировать прод-ветку без манипуляций с `process.env`
 * на уровне модуля.
 *
 * @param {{
 *   registry: RoomRegistry,
 *   clientDistDir?: string,
 *   isProduction?: boolean,
 * }} deps
 * @returns {import('express').Express}
 */
export function createApp({
  registry,
  clientDistDir = CLIENT_DIST_DIR,
  isProduction = config.isProduction(),
}) {
  if (!registry) {
    throw new Error('createApp: registry обязателен (RoomRegistry instance) — /healthz от него зависит.');
  }

  const app = express();

  // За реверс-прокси (nginx/Caddy) в проде — для корректных X-Forwarded-* (TDD §12.2).
  app.set('trust proxy', 1);

  // Secure-заголовки (CSP/nosniff/Referrer-Policy/X-Frame-Options/HSTS,
  // SEC-04/13/14/21) — глобально, до раздачи чего-либо: это первая точка,
  // реально отдающая ответы браузерам с этого origin (задача 15).
  app.use(createSecurityHeadersMiddleware(config));

  app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok', rooms: registry.count() });
  });

  // Раздача прод-сборки клиента с того же origin (Design §3.2/§12.2, SEC-12/15).
  // Строго под isProduction — в dev/test статики нет (клиент обслуживает
  // Vite dev-сервер отдельно, см. app/client/vite.config.js), это не мешает Vite.
  if (isProduction) {
    app.use(express.static(clientDistDir));
    // SPA-фолбэк: клиентский роутинг (напр. `/room/:id`, задача 19) должен
    // получать `index.html` при прямом переходе/обновлении страницы.
    // `/healthz` исключается СТРУКТУРНО через negative lookahead в самом
    // regex маршрута (а не только порядком регистрации выше) — инвариант
    // «/healthz никогда не проглатывается SPA-фолбэком» не должен зависеть
    // от текстового порядка строк в файле. `/socket.io/*` перехватывается
    // Socket.io на уровне http-сервера — сюда не долетает.
    app.get(/^\/(?!healthz).*/, (_req, res) => {
      res.sendFile(path.join(clientDistDir, 'index.html'), (err) => {
        if (!err) return;
        // index.html недоступен (отсутствует/нет прав) — не отдаём клиенту
        // стектрейс/абсолютный путь (SEC-15/16, без PII в ответе и в логе).
        logger.log('static-file-error');
        if (!res.headersSent) {
          res.status(500).end();
        }
      });
    });
  }

  return app;
}

// Общий реестр комнат: используется и `/healthz`, и обработчиками событий
// (registerHandlers ниже) — один и тот же instance, не два независимых счётчика.
const registry = new RoomRegistry();

const app = createApp({ registry });

const httpServer = createServer(app);

// Socket.io-транспорт (задача 6) + каркас обработчиков событий (задача 8).
const io = createGateway(httpServer, config);
registerHandlers(io, config, { registry });

// Запуск сервера пропускаем при импорте модуля в тестах.
if (process.env.NODE_ENV !== 'test') {
  httpServer.listen(PORT, () => {
    console.log(`server listening on port ${PORT}`);
  });
}

export { app, httpServer, io };
