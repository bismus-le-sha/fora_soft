import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { io as ioClient } from 'socket.io-client';
import { createGateway } from '../../src/socket/gateway.js';
import { registerHandlers } from '../../src/socket/handlers.js';
import * as config from '../../src/config.js';

const { ALLOWED_ORIGIN: TEST_ORIGIN, RATE_LIMIT } = config;

/**
 * Поднимает gateway + каркас хендлеров на эфемерном порту.
 * @param {{deps?: object, onConnection?: (socket: import('socket.io').Socket) => void}} [options]
 */
function startServer({ deps, onConnection } = {}) {
  const httpServer = createServer();
  const io = createGateway(httpServer, config);
  if (onConnection) {
    io.on('connection', onConnection);
  }
  registerHandlers(io, config, deps);

  return new Promise((resolve) => {
    httpServer.listen(0, () => {
      const { port } = httpServer.address();
      resolve({ httpServer, io, url: `http://localhost:${port}` });
    });
  });
}

function connectClient(url) {
  return ioClient(url, {
    reconnection: false,
    transports: ['websocket'],
    extraHeaders: { Origin: TEST_ORIGIN },
  });
}

function waitFor(emitter, event) {
  return new Promise((resolve) => emitter.once(event, resolve));
}

/** Опрашивает `conditionFn` до истинного результата либо таймаута. */
function waitUntil(conditionFn, timeoutMs = 2000, intervalMs = 10) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (conditionFn()) {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('waitUntil: timeout waiting for condition'));
        return;
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

function collectErrors(client) {
  const errors = [];
  client.on('error', (err) => errors.push(err));
  return errors;
}

describe('socket/handlers — каркас (F-40, SEC-05, SEC-15; Design §4.1/§6.1/§8)', () => {
  /** @type {{httpServer: import('node:http').Server, io: import('socket.io').Server, url: string} | undefined} */
  let ctx;

  afterEach(async () => {
    if (ctx) {
      ctx.io.close();
      await new Promise((resolve) => ctx.httpServer.close(resolve));
      ctx = undefined;
    }
  });

  it('неизвестное событие -> error{bad-payload}, соединение не рвётся (без краша)', async () => {
    ctx = await startServer();
    const client = connectClient(ctx.url);
    await waitFor(client, 'connect');

    const errorPromise = waitFor(client, 'error');
    client.emit('totally-unknown-event', { foo: 1 });
    const err = await errorPromise;

    expect(err).toEqual({ code: 'bad-payload', message: expect.any(String) });
    expect(client.connected).toBe(true);
    client.close();
  });

  it.each([
    ['chat:send', 'not-an-object'],
    ['join', 42],
    ['media:state', null],
    ['signal:offer', ['array', 'payload']],
  ])(
    'битый (структурно некорректный) payload известного события %s -> error{bad-payload}, без краша',
    async (eventName, badPayload) => {
      ctx = await startServer();
      const client = connectClient(ctx.url);
      await waitFor(client, 'connect');

      const errorPromise = waitFor(client, 'error');
      client.emit(eventName, badPayload);
      const err = await errorPromise;

      expect(err.code).toBe('bad-payload');
      expect(client.connected).toBe(true);
      client.close();
    },
  );

  it('error-эмиттер не содержит внутренних деталей (SEC-15): только code + generic message', async () => {
    ctx = await startServer();
    const client = connectClient(ctx.url);
    await waitFor(client, 'connect');

    const errorPromise = waitFor(client, 'error');
    client.emit('bogus-event', {});
    const err = await errorPromise;

    expect(Object.keys(err).sort()).toEqual(['code', 'message']);
    expect(err.message).not.toMatch(/stack|Error:|at Object|TypeError/i);
    client.close();
  });

  it('сервер остаётся живым после серии некорректных событий: новое соединение подключается штатно', async () => {
    ctx = await startServer();
    const flaky = connectClient(ctx.url);
    await waitFor(flaky, 'connect');

    for (let i = 0; i < 20; i += 1) {
      flaky.emit('unknown-event-' + i, i % 2 === 0 ? 'bad' : null);
    }

    const fresh = connectClient(ctx.url);
    await waitFor(fresh, 'connect');
    expect(fresh.connected).toBe(true);

    flaky.close();
    fresh.close();
  });

  it('rate-limit категории "chat" срабатывает после исчерпания бюджета (SEC-05)', async () => {
    ctx = await startServer();
    const client = connectClient(ctx.url);
    await waitFor(client, 'connect');
    const errors = collectErrors(client);

    const attempts = RATE_LIMIT.chat.points + 3;
    for (let i = 0; i < attempts; i += 1) {
      client.emit('chat:send', { text: `msg-${i}` });
    }

    await waitUntil(() => errors.some((e) => e.code === 'rate-limited'));
    expect(errors.some((e) => e.code === 'rate-limited')).toBe(true);
    expect(client.connected).toBe(true);
    client.close();
  });

  it('rate-limit категории "join" срабатывает после исчерпания бюджета (SEC-05)', async () => {
    ctx = await startServer();
    const client = connectClient(ctx.url);
    await waitFor(client, 'connect');
    const errors = collectErrors(client);

    const attempts = RATE_LIMIT.join.points + 3;
    for (let i = 0; i < attempts; i += 1) {
      client.emit('join', { roomId: 'r1', name: `A${i}` });
    }

    await waitUntil(() => errors.some((e) => e.code === 'rate-limited'));
    expect(errors.some((e) => e.code === 'rate-limited')).toBe(true);
    expect(client.connected).toBe(true);
    client.close();
  });

  it('rate-limit категории "signal" срабатывает после исчерпания бюджета (SEC-05)', async () => {
    ctx = await startServer();
    const client = connectClient(ctx.url);
    await waitFor(client, 'connect');
    const errors = collectErrors(client);

    const attempts = RATE_LIMIT.signal.points + 5;
    for (let i = 0; i < attempts; i += 1) {
      client.emit('signal:offer', { to: 'peer-id', sdp: 'v=0...' });
    }

    await waitUntil(() => errors.some((e) => e.code === 'rate-limited'));
    expect(errors.some((e) => e.code === 'rate-limited')).toBe(true);
    expect(client.connected).toBe(true);
    client.close();
  });

  it('rate-limit не применяется к "leave" (нет категории в Design §6.1) — leave не рвётся в error{rate-limited}', async () => {
    ctx = await startServer();
    const client = connectClient(ctx.url);
    await waitFor(client, 'connect');
    const errors = collectErrors(client);

    for (let i = 0; i < RATE_LIMIT.chat.points + 5; i += 1) {
      client.emit('leave', {});
    }

    // Даём событийному циклу время доставить все emit; ни одно НЕ должно
    // быть rate-limited (leave вне категорий rate-limit по Design §6.1).
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(errors.some((e) => e.code === 'rate-limited')).toBe(false);
    client.close();
  });

  it('leave без payload (клиент не передаёт аргумент) не считается bad-payload', async () => {
    ctx = await startServer();
    const client = connectClient(ctx.url);
    await waitFor(client, 'connect');
    const errors = collectErrors(client);

    client.emit('leave');
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(errors).toEqual([]);
    client.close();
  });

  it('leave с payload=null не считается bad-payload (задача 32, найдено E2E в реальном браузере)', async () => {
    // Реальный клиентский `signalingClient.emit(event, payload)`
    // (`app/client/src/signalingClient.js`) вызывается из `RoomScreen`/
    // `ControlBar` как `emit('leave')` — без второго аргумента на СТОРОНЕ
    // ВЫЗЫВАЮЩЕГО. Но сама функция-обёртка объявлена с именованным
    // параметром `payload` и форвардит его в `socket.emit(event, payload)`
    // ВСЕГДА с двумя позиционными аргументами (`arguments.length === 2`),
    // даже когда его значение — `undefined`. `JSON.stringify(['leave', undefined])`
    // даёт `["leave",null]` — по проводу долетает буквальный `null`, а не
    // «аргумент отсутствует» (это отличается от `client.emit('leave')` в
    // тесте выше, где `arguments.length === 1`). Раньше это доходило только
    // до `payload === undefined` в `handlers.js`, что `null` не покрывало —
    // сервер отвечал `error{bad-payload}`, и `leave` тихо игнорировался,
    // хотя браузер именно так его и эмитит (обнаружено E2E-smoke, задача 32,
    // не покрывалось Node-интеграционными тестами: `socket.io-client` в
    // Node, вызванный здесь как `client.emit('leave')`, не воспроизводит
    // этот сериализационный нюанс обёртки).
    ctx = await startServer();
    const client = connectClient(ctx.url);
    await waitFor(client, 'connect');
    const errors = collectErrors(client);

    client.emit('leave', null);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(errors).toEqual([]);
    client.close();
  });

  it('disconnect вызывает rateLimit.release(socket.id) (устраняет утечку буфера токенов, см. JSDoc lib/rateLimit.js)', async () => {
    const releasedIds = [];
    let serverSocketId;
    ctx = await startServer({
      deps: {
        rateLimit: {
          allow: () => true,
          release: (socketId) => releasedIds.push(socketId),
        },
      },
      onConnection: (socket) => {
        serverSocketId = socket.id;
      },
    });

    const client = connectClient(ctx.url);
    await waitFor(client, 'connect');
    client.close();

    await waitUntil(() => releasedIds.length > 0);
    expect(releasedIds).toEqual([serverSocketId]);
  });
});
