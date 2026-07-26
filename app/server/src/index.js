import express from 'express';
import { createServer } from 'node:http';
import * as config from './config.js';
import { createGateway } from './socket/gateway.js';
import { registerHandlers } from './socket/handlers.js';

const { PORT } = config;

const app = express();

// За реверс-прокси (nginx/Caddy) в проде — для корректных X-Forwarded-* (TDD §12.2).
app.set('trust proxy', 1);

app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

const httpServer = createServer(app);

// Socket.io-транспорт (задача 6) + каркас обработчиков событий (задача 8).
const io = createGateway(httpServer, config);
registerHandlers(io, config);

// Запуск сервера пропускаем при импорте модуля в тестах.
if (process.env.NODE_ENV !== 'test') {
  httpServer.listen(PORT, () => {
    console.log(`server listening on port ${PORT}`);
  });
}

export { app, httpServer, io };
