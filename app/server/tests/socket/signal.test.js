import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { io as ioClient } from 'socket.io-client';
import { createGateway } from '../../src/socket/gateway.js';
import { registerHandlers } from '../../src/socket/handlers.js';
import { RoomRegistry } from '../../src/domain/RoomRegistry.js';
import * as config from '../../src/config.js';

const { ALLOWED_ORIGIN: TEST_ORIGIN, RATE_LIMIT } = config;

/**
 * Задача 14 — Ретрансляция сигналинга (offer/answer/ice) (F-06, US-6, SEC-18).
 *
 * Интеграционные тесты (`socket.io-client` против реального `io` + каркас
 * хендлеров задачи 8), фиксирующие поведение `RoomService.relaySignal` +
 * `signal:offer/answer/ice`-хендлеров. Не critical — тесты и код пишет
 * `implementer` сам (без отдельного test-first гейта).
 *
 * Контракт (Design §6.1/§6.2/§7.1; Plan §14):
 *   C→S `signal:offer|answer { to, sdp }` / `signal:ice { to, candidate }` →
 *   rate-limit(signal) → проверить, что `to` — участник ТОЙ ЖЕ комнаты →
 *   relay `signal:<kind> { from, sdp|candidate }` ТОЛЬКО адресату (не
 *   broadcast всей комнате). Сервер НЕ парсит SDP — ретранслирует как
 *   непрозрачную строку/объект без изменений.
 *
 * Критерии приёмки (Plan §14):
 *   - offer доставляется только адресату (`to`), не остальным участникам
 *     комнаты и не самому отправителю;
 *   - `to` вне комнаты отправителя (в другой комнате либо несуществующий
 *     socket.id) → событие молча игнорируется, никому не доставляется;
 *   - SDP ретранслируется как непрозрачная строка — байт-в-байт совпадает с
 *     отправленной, без парсинга/изменений сервером.
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

/** Ждёт `signal:<kind>` не дольше `timeoutMs`. `{type:'signal', data}` либо `{type:'timeout'}`. */
function nextSignal(emitter, kind, timeoutMs = 800) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ type: 'timeout' }), timeoutMs);
    emitter.once(`signal:${kind}`, (data) => {
      clearTimeout(t);
      resolve({ type: 'signal', data });
    });
  });
}

function collectErrors(client) {
  const errors = [];
  client.on('error', (e) => errors.push(e));
  return errors;
}

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

describe('socket signal:offer/answer/ice — ретрансляция только адресату (F-06, US-6, SEC-18; Design §6.1/§7.1)', () => {
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

  // --- happy-path: доставка только адресату -------------------------------

  it('signal:offer доставляется только адресату (не остальным участникам комнаты, не самому отправителю)', async () => {
    ctx = await startServer();
    const roomId = 'room-signal-offer';
    const { client: a, selfId: aId } = await joinOne(roomId, 'Алиса');
    const { client: b, selfId: bId } = await joinOne(roomId, 'Борис');
    const { client: c } = await joinOne(roomId, 'Виктор');

    const onB = nextSignal(b, 'offer');
    const onC = nextSignal(c, 'offer');
    const onA = nextSignal(a, 'offer');
    const sdp = 'v=0\r\no=- 123 456 IN IP4 127.0.0.1\r\ns=-\r\n';
    a.emit('signal:offer', { to: bId, sdp });

    const rb = await onB;
    expect(rb.type).toBe('signal');
    expect(rb.data).toEqual({ from: aId, sdp });

    // Ни третий участник, ни сам отправитель offer не получают.
    const rc = await onC;
    expect(rc.type).toBe('timeout');
    const ra = await onA;
    expect(ra.type).toBe('timeout');
  }, 15000);

  it('signal:answer доставляется только адресату (симметрично offer)', async () => {
    ctx = await startServer();
    const roomId = 'room-signal-answer';
    const { client: a, selfId: aId } = await joinOne(roomId, 'Алиса');
    const { client: b, selfId: bId } = await joinOne(roomId, 'Борис');
    const { client: c } = await joinOne(roomId, 'Виктор');

    const onA = nextSignal(a, 'answer');
    const onC = nextSignal(c, 'answer');
    const sdp = 'v=0\r\no=- 999 1 IN IP4 127.0.0.1\r\ns=-\r\n';
    b.emit('signal:answer', { to: aId, sdp });

    const ra = await onA;
    expect(ra.type).toBe('signal');
    expect(ra.data).toEqual({ from: bId, sdp });

    const rc = await onC;
    expect(rc.type).toBe('timeout');
  }, 15000);

  it('signal:ice доставляется только адресату; candidate ретранслируется как есть', async () => {
    ctx = await startServer();
    const roomId = 'room-signal-ice';
    const { client: a, selfId: aId } = await joinOne(roomId, 'Алиса');
    const { client: b, selfId: bId } = await joinOne(roomId, 'Борис');
    const { client: c } = await joinOne(roomId, 'Виктор');

    const onB = nextSignal(b, 'ice');
    const onC = nextSignal(c, 'ice');
    const candidate = { candidate: 'candidate:1 1 UDP 2122260223 10.0.0.1 54321 typ host', sdpMid: '0', sdpMLineIndex: 0 };
    a.emit('signal:ice', { to: bId, candidate });

    const rb = await onB;
    expect(rb.type).toBe('signal');
    expect(rb.data).toEqual({ from: aId, candidate });

    const rc = await onC;
    expect(rc.type).toBe('timeout');
  }, 15000);

  // --- SDP как непрозрачная строка ------------------------------------------

  it('SDP ретранслируется как непрозрачная строка — байт-в-байт совпадает с отправленной, без парсинга/изменений', async () => {
    ctx = await startServer();
    const roomId = 'room-signal-opaque';
    const { client: a, selfId: aId } = await joinOne(roomId, 'Алиса');
    const { client: b, selfId: bId } = await joinOne(roomId, 'Борис');

    // Строка НЕ похожа на валидный SDP (сервер не должен её парсить/проверять).
    const weirdSdp = 'это не настоящий SDP <script>alert(1)</script> \r\n\t  12345';
    const onB = nextSignal(b, 'offer');
    a.emit('signal:offer', { to: bId, sdp: weirdSdp });

    const rb = await onB;
    expect(rb.type).toBe('signal');
    expect(rb.data.from).toBe(aId);
    expect(rb.data.sdp).toBe(weirdSdp);
  }, 15000);

  // --- to вне комнаты отправителя --------------------------------------------

  it('`to` — участник другой комнаты (не той, где отправитель) → игнорируется, никому не доставляется', async () => {
    ctx = await startServer();
    const { client: a } = await joinOne('room-signal-x', 'Алиса');
    const { client: outsider, selfId: outsiderId } = await joinOne('room-signal-y', 'Чужак');

    const onOutsider = nextSignal(outsider, 'offer');
    a.emit('signal:offer', { to: outsiderId, sdp: 'sdp-should-not-arrive' });

    const rOutsider = await onOutsider;
    expect(rOutsider.type).toBe('timeout');
  }, 15000);

  it('`to` — несуществующий socket.id → игнорируется, без ошибки и без краша сервера', async () => {
    ctx = await startServer();
    const { client: a } = await joinOne('room-signal-ghost', 'Алиса');
    const errors = collectErrors(a);

    a.emit('signal:offer', { to: 'sock_does_not_exist_123', sdp: 'sdp' });
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(errors.length).toBe(0);
    expect(a.connected).toBe(true);
  }, 15000);

  it('`to` отсутствует/не строка → безопасный no-op, без краша', async () => {
    ctx = await startServer();
    const roomId = 'room-signal-badto';
    const { client: a } = await joinOne(roomId, 'Алиса');
    const { client: b } = await joinOne(roomId, 'Борис');

    const onB1 = nextSignal(b, 'offer');
    a.emit('signal:offer', { sdp: 'no-to-field' });
    expect((await onB1).type).toBe('timeout');

    const onB2 = nextSignal(b, 'offer');
    a.emit('signal:offer', { to: 42, sdp: 'numeric-to' });
    expect((await onB2).type).toBe('timeout');

    expect(a.connected).toBe(true);
    expect(b.connected).toBe(true);
  }, 15000);

  // --- сессия/сокет: signal:* до join --------------------------------------

  it('signal:offer ДО join → безопасный no-op, ничего не утекает в чужую комнату, сервер жив', async () => {
    ctx = await startServer();
    const { client: observer, selfId: observerId } = await joinOne('room-signal-observer', 'Наблюдатель');

    const [ghost] = await connectMany(1);
    const onObserver = nextSignal(observer, 'offer');
    ghost.emit('signal:offer', { to: observerId, sdp: 'ghost-sdp' });
    expect((await onObserver).type).toBe('timeout');

    // Сервер жив: ghost затем корректно входит и signal:offer работает.
    const gJoin = await joinResult(ghost, { roomId: 'room-signal-ghost2', name: 'Гость' });
    expect(gJoin.type).toBe('ok');
    const [watcher] = await connectMany(1);
    const wJoin = await joinResult(watcher, { roomId: 'room-signal-ghost2', name: 'Смотрящий' });
    expect(wJoin.type).toBe('ok');

    const onWatcher = nextSignal(watcher, 'offer');
    ghost.emit('signal:offer', { to: wJoin.data.selfId, sdp: 'real-sdp' });
    const rw = await onWatcher;
    expect(rw.type).toBe('signal');
    expect(rw.data).toEqual({ from: gJoin.data.selfId, sdp: 'real-sdp' });
  }, 15000);

  // --- rate-limit категории "signal" (SEC-05, общий бюджет с media:state) ---

  it('rate-limit категории "signal" применяется к signal:offer (SEC-05)', async () => {
    ctx = await startServer();
    const roomId = 'room-signal-ratelimit';
    const { client: a } = await joinOne(roomId, 'Алиса');
    const { client: b, selfId: bId } = await joinOne(roomId, 'Борис');
    void b;
    const errors = collectErrors(a);

    const attempts = RATE_LIMIT.signal.points + 5;
    for (let i = 0; i < attempts; i += 1) {
      a.emit('signal:offer', { to: bId, sdp: `sdp-${i}` });
    }

    await waitUntil(() => errors.some((e) => e.code === 'rate-limited'));
    expect(errors.some((e) => e.code === 'rate-limited')).toBe(true);
    expect(a.connected).toBe(true);
  }, 15000);
});
