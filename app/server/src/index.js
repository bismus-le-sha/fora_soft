import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as config from './config.js';
import { createGateway } from './socket/gateway.js';
import { registerHandlers } from './socket/handlers.js';
import { RoomRegistry } from './domain/RoomRegistry.js';

const { PORT } = config;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Прод-сборка клиента (Vite `vite build` → app/client/dist, Design §3.2/§12.2).
const CLIENT_DIST_DIR = path.join(__dirname, '../../client/dist');

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
  isProduction = process.env.NODE_ENV === 'production',
}) {
  const app = express();

  // За реверс-прокси (nginx/Caddy) в проде — для корректных X-Forwarded-* (TDD §12.2).
  app.set('trust proxy', 1);

  app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok', rooms: registry.count() });
  });

  // Раздача прод-сборки клиента с того же origin (Design §3.2/§12.2, SEC-12/15).
  // Строго под isProduction — в dev/test статики нет (клиент обслуживает
  // Vite dev-сервер отдельно, см. app/client/vite.config.js), это не мешает Vite.
  if (isProduction) {
    app.use(express.static(clientDistDir));
    // SPA-фолбэк: клиентский роутинг (напр. `/room/:id`, задача 19) должен
    // получать `index.html` при прямом переходе/обновлении страницы. `/healthz`
    // зарегистрирован выше и `/socket.io/*` перехватывается Socket.io на
    // уровне http-сервера — сюда не долетают.
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientDistDir, 'index.html'));
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
