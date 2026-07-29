import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { io as ioClient } from 'socket.io-client';
import { createGateway } from '../../src/socket/gateway.js';
import { registerHandlers } from '../../src/socket/handlers.js';
import { RoomRegistry } from '../../src/domain/RoomRegistry.js';
import * as config from '../../src/config.js';

const { ALLOWED_ORIGIN: TEST_ORIGIN, RATE_LIMIT } = config;

/**
 * Задача 13 — Обработчик `media:state` и broadcast (F-09/16/18, US-7/12).
 *
 * Интеграционные тесты (`socket.io-client` против реального `io` + каркас
 * хендлеров задачи 8), фиксирующие поведение `RoomService.setMedia` +
 * `media:state`-хендлера. Не critical — тесты и код пишет `implementer` сам
 * (без отдельного test-first гейта).
 *
 * Контракт (Design §6.1/§6.2/§7.2; Plan §13):
 *   C→S `media:state { audio, video }` → rate-limit(signal) → обновить
 *   `participant.media{audio,video}` → broadcast `media:state{id,audio,video}`
 *   ОСТАЛЬНЫМ участникам комнаты (не автору).
 *
 * Критерии приёмки (Plan §13):
 *   - смена статуса mic/cam доставляется остальным участникам;
 *   - статус хранится в participant и попадает в `join:ok.participants`
 *     (нового участника, вошедшего ПОСЛЕ смены статуса другим участником);
 *   - невалидный payload (не-boolean audio/video, битая структура) —
 *     безопасный no-op, без broadcast и без краша сервера;
 *   - `media:state` без валидной сессии (до `join`) — безопасный no-op;
 *   - rate-limit категории `signal` применяется (общий бюджет с
 *     signal:offer/answer/ice, Design §6.1).
 */

function startServer() {
  const httpServer = createServer();
  const io = createGateway(httpServer, config);
  const registry = new RoomRegistry();
  registerHandlers(io, config, { registry });

  return new Promise((resolve) => {
    httpServer.listen(0, () => {
      const { port } = httpServer.address();
      resolve({ httpServer, io, registry, url: `http://localhost:${port}` });
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

/** Эмитит `join`, резолвит первым из `join:ok`/`join:rejected` (или timeout). */
function joinResult(client, payload, timeoutMs = 1000) {
  const p = new Promise((resolve) => {
    client.once('join:ok', (data) => resolve({ type: 'ok', data }));
    client.once('join:rejected', (data) => resolve({ type: 'rejected', data }));
    setTimeout(() => resolve({ type: 'timeout' }), timeoutMs);
  });
  client.emit('join', payload);
  return p;
}

/**
 * Ждёт `media:state` не дольше `timeoutMs`. `{type:'state', data}` при
 * доставке, иначе `{type:'timeout'}`.
 */
function nextMediaState(emitter, timeoutMs = 800) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ type: 'timeout' }), timeoutMs);
    emitter.once('media:state', (data) => {
      clearTimeout(t);
      resolve({ type: 'state', data });
    });
  });
}

function collectErrors(client) {
  const errors = [];
  client.on('error', (e) => errors.push(e));
  return errors;
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
        reject(new Error('waitUntil: timeout'));
        return;
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

describe('socket media:state — обновление и broadcast (F-09/16/18, US-7/12; Design §6.1/§6.2/§7.2)', () => {
  /** @type {{httpServer: import('node:http').Server, io: import('socket.io').Server, registry: RoomRegistry, url: string} | undefined} */
  let ctx;
  /** @type {import('socket.io-client').Socket[]} */
  let clients = [];

  function makeClient() {
    const client = connectClient(ctx.url);
    clients.push(client);
    return client;
  }

  async function connectMany(n) {
    const list = Array.from({ length: n }, () => makeClient());
    await Promise.all(list.map((c) => waitFor(c, 'connect')));
    return list;
  }

  /** Подключает клиента и вводит его в комнату; возвращает {client, selfId}. */
  async function joinOne(roomId, name) {
    const [client] = await connectMany(1);
    const res = await joinResult(client, { roomId, name });
    expect(res.type).toBe('ok');
    return { client, selfId: res.data.selfId };
  }

  afterEach(async () => {
    for (const c of clients) c.close();
    clients = [];
    if (ctx) {
      ctx.io.close();
      await new Promise((resolve) => ctx.httpServer.close(resolve));
      ctx = undefined;
    }
  });

  // --- happy-path ---------------------------------------------------------

  it('участник выключает камеру → media:state доставляется остальным участникам (не автору)', async () => {
    ctx = await startServer();
    const roomId = 'room-media';
    const { client: a, selfId: aId } = await joinOne(roomId, 'Алиса');
    const [b] = await connectMany(1);
    expect((await joinResult(b, { roomId, name: 'Борис' })).type).toBe('ok');

    const onB = nextMediaState(b);
    const onA = nextMediaState(a);
    a.emit('media:state', { audio: true, video: false });

    const rb = await onB;
    expect(rb.type).toBe('state');
    expect(rb.data).toEqual({ id: aId, audio: true, video: false });

    // Автору собственное media:state не приходит (broadcast "остальным").
    const ra = await onA;
    expect(ra.type).toBe('timeout');
  }, 15000);

  it('доставляется ВСЕМ остальным в комнате (3 участника)', async () => {
    ctx = await startServer();
    const roomId = 'room-media-multi';
    const { client: a, selfId: aId } = await joinOne(roomId, 'Алиса');
    const [b, c] = await connectMany(2);
    expect((await joinResult(b, { roomId, name: 'Борис' })).type).toBe('ok');
    expect((await joinResult(c, { roomId, name: 'Виктор' })).type).toBe('ok');

    const onB = nextMediaState(b);
    const onC = nextMediaState(c);
    a.emit('media:state', { audio: false, video: true });

    const rb = await onB;
    const rc = await onC;
    expect(rb.type).toBe('state');
    expect(rc.type).toBe('state');
    expect(rb.data).toEqual({ id: aId, audio: false, video: true });
    expect(rc.data).toEqual({ id: aId, audio: false, video: true });
  }, 15000);

  // --- хранение статуса в participant + join:ok.participants --------------

  it('статус хранится в participant и попадает в join:ok.participants следующему вошедшему', async () => {
    ctx = await startServer();
    const roomId = 'room-media-snapshot';
    const { client: a, selfId: aId } = await joinOne(roomId, 'Алиса');
    const [b] = await connectMany(1);
    const onB = nextMediaState(b);
    // b ещё не вошёл — media:state от a пока некому доставить, это ОК.
    a.emit('media:state', { audio: false, video: false });
    // Даём событию долететь и обновить серверное состояние ДО входа b.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect((await onB).type).toBe('timeout'); // b ещё не в комнате

    const bJoin = await joinResult(b, { roomId, name: 'Борис' });
    expect(bJoin.type).toBe('ok');
    const aSnapshot = bJoin.data.participants.find((p) => p.id === aId);
    expect(aSnapshot).toMatchObject({ media: { audio: false, video: false } });

    // Также проверяем напрямую серверную модель.
    const room = ctx.registry.get(roomId);
    expect(room.get(aId).media).toEqual({ audio: false, video: false });
  }, 15000);

  // --- валидация payload ----------------------------------------------------

  it('невалидный payload (не-boolean audio/video) → media:state НЕ рассылается, без краша', async () => {
    ctx = await startServer();
    const roomId = 'room-media-invalid';
    const { client: a } = await joinOne(roomId, 'Алиса');
    const [b] = await connectMany(1);
    expect((await joinResult(b, { roomId, name: 'Борис' })).type).toBe('ok');

    const onB1 = nextMediaState(b);
    a.emit('media:state', { audio: 'yes', video: false });
    expect((await onB1).type).toBe('timeout');

    const onB2 = nextMediaState(b);
    a.emit('media:state', { audio: true }); // video отсутствует
    expect((await onB2).type).toBe('timeout');

    const onB3 = nextMediaState(b);
    a.emit('media:state', {});
    expect((await onB3).type).toBe('timeout');

    // Сервер жив: валидный media:state после этого проходит штатно.
    const onB4 = nextMediaState(b);
    a.emit('media:state', { audio: true, video: true });
    const rb = await onB4;
    expect(rb.type).toBe('state');
    expect(rb.data).toMatchObject({ audio: true, video: true });
  }, 15000);

  // --- сессия/сокет: media:state без валидного join --------------------------

  it('media:state ДО join → безопасный no-op, ничего не утекает в чужую комнату, сервер жив', async () => {
    ctx = await startServer();
    const observerRoom = 'room-media-observer';
    const { client: observer } = await joinOne(observerRoom, 'Наблюдатель');

    const [ghost] = await connectMany(1);
    const onObserver = nextMediaState(observer);
    ghost.emit('media:state', { audio: false, video: false });
    expect((await onObserver).type).toBe('timeout');

    // Сервер жив: ghost затем корректно входит и media:state работает.
    const gJoin = await joinResult(ghost, { roomId: 'room-media-ghost', name: 'Гость' });
    expect(gJoin.type).toBe('ok');
    const [watcher] = await connectMany(1);
    const wJoin = await joinResult(watcher, { roomId: 'room-media-ghost', name: 'Смотрящий' });
    expect(wJoin.type).toBe('ok');

    const onWatcher = nextMediaState(watcher);
    ghost.emit('media:state', { audio: true, video: false });
    const rw = await onWatcher;
    expect(rw.type).toBe('state');
    expect(rw.data).toMatchObject({ id: gJoin.data.selfId, audio: true, video: false });
  }, 15000);

  // --- rate-limit категории "signal" (SEC-05, общий бюджет с signal:*) ------

  it('rate-limit категории "signal" применяется к media:state (SEC-05)', async () => {
    ctx = await startServer();
    const roomId = 'room-media-ratelimit';
    const { client: a } = await joinOne(roomId, 'Алиса');
    const errors = collectErrors(a);

    const attempts = RATE_LIMIT.signal.points + 5;
    for (let i = 0; i < attempts; i += 1) {
      a.emit('media:state', { audio: i % 2 === 0, video: true });
    }

    await waitUntil(() => errors.some((e) => e.code === 'rate-limited'));
    expect(errors.some((e) => e.code === 'rate-limited')).toBe(true);
    expect(a.connected).toBe(true);
  }, 15000);
});
