import express from 'express';
import { createServer } from 'node:http';

// NOTE: числовые лимиты/порт переедут в единый config.js (см. impl-video-chat-room.md, задача 2).
// Здесь — только скаффолд Express + http-сервер (задача 1.2).
const PORT = process.env.PORT || 3001;

const app = express();

// За реверс-прокси (nginx/Caddy) в проде — для корректных X-Forwarded-* (TDD §12.2).
app.set('trust proxy', 1);

app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

const httpServer = createServer(app);

// Запуск сервера пропускаем при импорте модуля в тестах.
if (process.env.NODE_ENV !== 'test') {
  httpServer.listen(PORT, () => {
    console.log(`server listening on port ${PORT}`);
  });
}

export { app, httpServer };
