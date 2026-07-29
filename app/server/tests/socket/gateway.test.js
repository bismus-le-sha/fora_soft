import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { io as ioClient } from 'socket.io-client';
import { createGateway } from '../../src/socket/gateway.js';
import { MAX_HTTP_BUFFER_SIZE as REAL_MAX_HTTP_BUFFER_SIZE } from '../../src/config.js';
import { listenEphemeral } from '../helpers/http.js';

const TEST_ORIGIN = 'http://localhost:5173';

/** Поднимает gateway на эфемерном порту и возвращает контекст для теста. */
async function startGateway(configOverrides = {}) {
  const httpServer = createServer();
  const io = createGateway(httpServer, {
    ALLOWED_ORIGIN: TEST_ORIGIN,
    MAX_HTTP_BUFFER_SIZE: REAL_MAX_HTTP_BUFFER_SIZE,
    ...configOverrides,
  });

  const { url } = await listenEphemeral(httpServer);
  return { httpServer, io, url };
}

function connectClient(url, origin) {
  return ioClient(url, {
    reconnection: false,
    transports: ['websocket'],
    extraHeaders: { Origin: origin },
  });
}

/**
 * Соединение БЕЗ заголовка `Origin` (опционально с `Referer`) — эмулирует
 * реальный браузер на первом (polling) handshake, который `Origin` для
 * same-origin запроса не шлёт (задача 32, найдено E2E в реальном Chromium;
 * см. JSDoc `allowRequest` в `gateway.js`). Форсируем `transports: ['polling']`
 * — именно на этом транспорте наблюдается отсутствие `Origin`; `websocket`
 * его шлёт всегда, тест на это не опирается.
 */
function connectClientWithoutOrigin(url, referer) {
  return ioClient(url, {
    reconnection: false,
    transports: ['polling'],
    extraHeaders: referer ? { Referer: referer } : {},
  });
}

function waitFor(emitter, event) {
  return new Promise((resolve) => emitter.once(event, resolve));
}

describe('socket/gateway (SEC-08, SEC-12, SEC-15; Design §4.1/§9.3/§10.3/§10.4)', () => {
  /** @type {{httpServer: import('node:http').Server, io: import('socket.io').Server} | undefined} */
  let ctx;

  afterEach(async () => {
    if (ctx) {
      ctx.io.close();
      await new Promise((resolve) => ctx.httpServer.close(resolve));
      ctx = undefined;
    }
  });

  it('createGateway(httpServer, config) возвращает Socket.io-сервер с maxHttpBufferSize из config (не хардкод)', async () => {
    ctx = await startGateway();
    expect(typeof ctx.io.on).toBe('function');
    expect(ctx.io.engine.opts.maxHttpBufferSize).toBe(REAL_MAX_HTTP_BUFFER_SIZE);
  });

  it('подключение с разрешённого origin (ALLOWED_ORIGIN) устанавливается', async () => {
    ctx = await startGateway();
    const client = connectClient(ctx.url, TEST_ORIGIN);
    await waitFor(client, 'connect');
    expect(client.connected).toBe(true);
    client.close();
  });

  it('подключение с чужого origin отклоняется на уровне handshake, а не только CORS-заголовком (SEC-15)', async () => {
    ctx = await startGateway();
    const client = connectClient(ctx.url, 'http://evil.example');
    const err = await waitFor(client, 'connect_error');
    expect(err).toBeTruthy();
    expect(client.connected).toBe(false);
    client.close();
  });

  it('без заголовка Origin, но с Referer на разрешённый origin — подключение устанавливается (задача 32, реальный браузер на polling-handshake)', async () => {
    ctx = await startGateway();
    const client = connectClientWithoutOrigin(ctx.url, `${TEST_ORIGIN}/room/abc`);
    await waitFor(client, 'connect');
    expect(client.connected).toBe(true);
    client.close();
  });

  it('без Origin и без Referer — отклоняется (fail-closed, не безусловный allow)', async () => {
    ctx = await startGateway();
    const client = connectClientWithoutOrigin(ctx.url, undefined);
    const err = await waitFor(client, 'connect_error');
    expect(err).toBeTruthy();
    expect(client.connected).toBe(false);
    client.close();
  });

  it('без Origin, с Referer на чужой origin — отклоняется', async () => {
    ctx = await startGateway();
    const client = connectClientWithoutOrigin(ctx.url, 'http://evil.example/room/abc');
    const err = await waitFor(client, 'connect_error');
    expect(err).toBeTruthy();
    expect(client.connected).toBe(false);
    client.close();
  });

  it('payload больше настоящего MAX_HTTP_BUFFER_SIZE (64KB) из config.js рвёт соединение ДО обработки хендлером (SEC-08)', async () => {
    ctx = await startGateway();
    let received = false;
    ctx.io.on('connection', (socket) => {
      socket.on('probe', () => {
        received = true;
      });
    });

    const client = connectClient(ctx.url, TEST_ORIGIN);
    await waitFor(client, 'connect');

    const disconnected = waitFor(client, 'disconnect');
    const oversizedPayload = 'x'.repeat(REAL_MAX_HTTP_BUFFER_SIZE + 4096); // строго больше лимита
    client.emit('probe', oversizedPayload);
    const reason = await disconnected;

    expect(reason).toBeTruthy();
    expect(received).toBe(false);
    client.close();
  });

  it('payload в пределах лимита доходит до хендлера без разрыва соединения (контрольный кейс)', async () => {
    ctx = await startGateway();
    let received;
    const receivedPromise = new Promise((resolve) => {
      ctx.io.on('connection', (socket) => {
        socket.on('probe', (payload) => {
          received = payload;
          resolve();
        });
      });
    });

    const client = connectClient(ctx.url, TEST_ORIGIN);
    await waitFor(client, 'connect');
    client.emit('probe', 'short-payload');
    await receivedPromise;

    expect(received).toBe('short-payload');
    expect(client.connected).toBe(true);
    client.close();
  });

  it('лимит читается из config, а не хардкодится: меньший MAX_HTTP_BUFFER_SIZE в config рвёт то, что прошло бы при значении по умолчанию', async () => {
    ctx = await startGateway({ MAX_HTTP_BUFFER_SIZE: 128 });
    let received = false;
    ctx.io.on('connection', (socket) => {
      socket.on('probe', () => {
        received = true;
      });
    });

    const client = connectClient(ctx.url, TEST_ORIGIN);
    await waitFor(client, 'connect');

    const disconnected = waitFor(client, 'disconnect');
    client.emit('probe', 'x'.repeat(256)); // > 128, но заведомо < 64KB
    await disconnected;

    expect(received).toBe(false);
    client.close();
  });

  it('в проде (NODE_ENV=production) wildcard ALLOWED_ORIGIN="*" запрещён (SEC-15)', () => {
    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const httpServer = createServer();
    try {
      expect(() =>
        createGateway(httpServer, {
          ALLOWED_ORIGIN: '*',
          MAX_HTTP_BUFFER_SIZE: REAL_MAX_HTTP_BUFFER_SIZE,
        }),
      ).toThrow();
    } finally {
      process.env.NODE_ENV = previousEnv;
      httpServer.close();
    }
  });

  it('вне прода wildcard ALLOWED_ORIGIN="*" не запрещён на уровне gateway (ограничение специфично для production)', () => {
    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    const httpServer = createServer();
    let io;
    try {
      expect(() => {
        io = createGateway(httpServer, {
          ALLOWED_ORIGIN: '*',
          MAX_HTTP_BUFFER_SIZE: REAL_MAX_HTTP_BUFFER_SIZE,
        });
      }).not.toThrow();
    } finally {
      process.env.NODE_ENV = previousEnv;
      if (io) io.close();
      httpServer.close();
    }
  });
});
