import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { io as ioClient } from 'socket.io-client';
import { createGateway } from '../../src/socket/gateway.js';
import { registerHandlers } from '../../src/socket/handlers.js';
import { RoomRegistry } from '../../src/domain/RoomRegistry.js';
import { createChatMessage } from '../../src/domain/Message.js';
import * as config from '../../src/config.js';

const { ALLOWED_ORIGIN: TEST_ORIGIN, ROOM_CAPACITY } = config;

/**
 * Задача 10 [critical] — Очистка состояния комнаты при выходе/обрыве
 * последнего (SEC-11).
 *
 * Интеграционные тесты (`socket.io-client` против реального `io` + каркас
 * хендлеров задачи 8), фиксирующие контракт `RoomService.leave` +
 * обработчиков `leave`/`disconnect` ДО реализации (test-first, red-фаза).
 * Реализацию делает `implementer` (задача 10.2), НЕ меняя эти тесты.
 *
 * Критерии приёмки (Plan §10, Design §5.2/§7.3/§10.3, PRD F-09/F-17/F-18,
 * US-10/US-11, SEC-11):
 *   - happy-path: выход/обрыв ПОСЛЕДНЕГО участника → комната полностью
 *     удаляется из реестра (`registry.count()` возвращается к 0, `get(roomId)`
 *     пуст, история недоступна); ресурсы освобождены;
 *   - broadcast: остальные получают `participant:left{id}` + `chat:system
 *     {event:'leave', subjectName}`;
 *   - `disconnect` эквивалентен явному `leave` (единый путь очистки);
 *   - НЕ последний участник вышел → комната НЕ удаляется, сохраняются
 *     оставшиеся участники и история чата;
 *   - идемпотентность: повторный `leave`/обрыв без краша, не «оживляет»
 *     состояние;
 *   - гонка: одновременный выход/обрыв всех → `count()` → 0, без краша;
 *   - SEC-11 anti-leak: массовые create-then-abandon → `count()` → 0 (нет
 *     «висящих» комнат); нельзя «оживить» очищенную комнату — повторный вход
 *     по тому же roomId создаёт СВЕЖУЮ пустую комнату (старая история не
 *     утекает).
 *
 * Инвариант проверяется по РЕАЛЬНОМУ серверному состоянию: в `deps`
 * пробрасываем собственный `RoomRegistry`.
 */

/**
 * Поднимает gateway + каркас хендлеров с ВНЕДРЁННЫМ реестром (для проверки
 * серверного состояния комнаты). `RoomService` — реальный (дефолтный).
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

/**
 * Ждёт событие `event` не дольше `timeoutMs`. Возвращает `{type:'event', data}`
 * либо `{type:'timeout'}` — в red-фазе (стаб `leave` ничего не эмитит) это
 * превращает «нет события» в явную ассерцию, а не в зависание.
 */
function waitForEvent(emitter, event, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ type: 'timeout' }), timeoutMs);
    emitter.once(event, (data) => {
      clearTimeout(t);
      resolve({ type: 'event', data });
    });
  });
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

/** Опрашивает предикат `fn` до истины или таймаута (для async серверного cleanup). */
async function waitUntil(fn, timeoutMs = 2000, stepMs = 20) {
  const start = Date.now();
  for (;;) {
    if (fn()) return true;
    if (Date.now() - start >= timeoutMs) return false;
    await new Promise((r) => setTimeout(r, stepMs));
  }
}

describe('socket leave/disconnect — очистка комнаты (SEC-11, US-10/11; Design §5.2/§7.3/§10.3)', () => {
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

  /** Подключает клиента и вводит его в комнату, возвращает {client, selfId}. */
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

  // --- happy-path: очистка при выходе/обрыве последнего --------------------

  it('явный leave ПОСЛЕДНЕГО участника → комната удаляется из реестра (count→0, get пуст)', async () => {
    ctx = await startServer();
    const roomId = 'room-last-leave';
    const { client } = await joinOne(roomId, 'Алиса');

    expect(ctx.registry.get(roomId)?.size()).toBe(1);
    expect(ctx.registry.count()).toBe(1);

    client.emit('leave', {});

    const cleaned = await waitUntil(() => ctx.registry.get(roomId) === undefined);
    expect(cleaned).toBe(true);
    expect(ctx.registry.count()).toBe(0);
  }, 15000);

  it('обрыв (disconnect) ПОСЛЕДНЕГО участника эквивалентен выходу → комната удаляется', async () => {
    ctx = await startServer();
    const roomId = 'room-last-disconnect';
    const { client } = await joinOne(roomId, 'Алиса');

    expect(ctx.registry.count()).toBe(1);

    client.close(); // транспортный disconnect === leave (Design §7.3)

    const cleaned = await waitUntil(() => ctx.registry.count() === 0);
    expect(cleaned).toBe(true);
    expect(ctx.registry.get(roomId)).toBeUndefined();
  }, 15000);

  it('при выходе участника остальные получают participant:left{id} и chat:system{event:leave, subjectName}', async () => {
    ctx = await startServer();
    const roomId = 'room-broadcast';
    const { client: a, selfId: aId } = await joinOne(roomId, 'Алиса');
    const [b] = await connectMany(1);
    const bJoin = await joinResult(b, { roomId, name: 'Борис' });
    expect(bJoin.type).toBe('ok');

    const leftP = waitForEvent(b, 'participant:left');
    const systemP = waitForEvent(b, 'chat:system');

    a.emit('leave', {});

    const left = await leftP;
    expect(left.type).toBe('event');
    expect(left.data).toMatchObject({ id: aId });

    const system = await systemP;
    expect(system.type).toBe('event');
    expect(system.data).toMatchObject({ event: 'leave', subjectName: 'Алиса' });
  }, 15000);

  it('обрыв участника → остальные получают participant:left{id} (F-18, US-11)', async () => {
    ctx = await startServer();
    const roomId = 'room-broadcast-disc';
    const { client: a, selfId: aId } = await joinOne(roomId, 'Алиса');
    const [b] = await connectMany(1);
    expect((await joinResult(b, { roomId, name: 'Борис' })).type).toBe('ok');

    const leftP = waitForEvent(b, 'participant:left');
    a.close();

    const left = await leftP;
    expect(left.type).toBe('event');
    expect(left.data).toMatchObject({ id: aId });
    // Комната НЕ удаляется — остаётся Борис.
    expect(await waitUntil(() => ctx.registry.get(roomId)?.size() === 1)).toBe(true);
  }, 15000);

  // --- НЕ последний участник: комната НЕ очищается -------------------------

  it('выход НЕ последнего участника → комната НЕ удаляется, остаётся оставшийся участник', async () => {
    ctx = await startServer();
    const roomId = 'room-not-last';
    const { client: a, selfId: aId } = await joinOne(roomId, 'Алиса');
    const [b] = await connectMany(1);
    const bJoin = await joinResult(b, { roomId, name: 'Борис' });
    expect(bJoin.type).toBe('ok');
    const bId = bJoin.data.selfId;

    expect(ctx.registry.get(roomId)?.size()).toBe(2);

    const leftP = waitForEvent(b, 'participant:left');
    a.emit('leave', {});
    expect((await leftP).type).toBe('event');

    // Комната ЖИВА, содержит ровно Бориса; счётчик реестра не обнулён.
    expect(ctx.registry.get(roomId)).toBeDefined();
    expect(ctx.registry.get(roomId).size()).toBe(1);
    expect(ctx.registry.count()).toBe(1);
    const remaining = ctx.registry.get(roomId).snapshot().participants;
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ id: bId, name: 'Борис' });
    // Ушедший больше не числится участником.
    expect(remaining.some((p) => p.id === aId)).toBe(false);
  }, 15000);

  it('выход НЕ последнего участника сохраняет историю чата комнаты (SEC-11: очистка только при size==0)', async () => {
    ctx = await startServer();
    const roomId = 'room-keep-history';
    const { client: a } = await joinOne(roomId, 'Алиса');
    const [b] = await connectMany(1);
    expect((await joinResult(b, { roomId, name: 'Борис' })).type).toBe('ok');

    // Инжектируем сообщение в историю напрямую (chat:send — задача 11, ещё стаб),
    // чтобы проверить именно инвариант жизненного цикла задачи 10.
    ctx.registry.get(roomId).pushMessage(
      createChatMessage({ authorId: 'x', authorName: 'Алиса', text: 'привет' }),
    );

    const leftP = waitForEvent(b, 'participant:left');
    a.emit('leave', {});
    expect((await leftP).type).toBe('event');

    // Комната жива → история НЕ должна теряться при выходе не последнего.
    const room = ctx.registry.get(roomId);
    expect(room).toBeDefined();
    const history = room.snapshot().history;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ kind: 'chat', text: 'привет' });
  }, 15000);

  // --- идемпотентность / robustness ---------------------------------------

  it('повторный leave (double leave) последнего участника → без краша, count остаётся 0', async () => {
    ctx = await startServer();
    const roomId = 'room-double-leave';
    const { client } = await joinOne(roomId, 'Алиса');

    client.emit('leave', {});
    expect(await waitUntil(() => ctx.registry.count() === 0)).toBe(true);

    // Второй leave по тому же (уже вышедшему) сокету — no-op, не воскрешает
    // комнату и не роняет процесс.
    const errP = waitForEvent(client, 'error', 400);
    client.emit('leave', {});
    expect((await errP).type).toBe('timeout');
    expect(ctx.registry.count()).toBe(0);

    // Сервер жив — новое соединение и вход работают.
    const [probe] = await connectMany(1);
    expect((await joinResult(probe, { roomId: 'room-probe', name: 'Проба' })).type).toBe('ok');
  }, 15000);

  it('одновременный выход ВСЕХ участников (гонка) → count→0, без «висящей» комнаты', async () => {
    ctx = await startServer();
    const roomId = 'room-race-leave';
    const members = await connectMany(ROOM_CAPACITY);
    for (let i = 0; i < members.length; i += 1) {
      expect((await joinResult(members[i], { roomId, name: `U${i}` })).type).toBe('ok');
    }
    expect(ctx.registry.get(roomId).size()).toBe(ROOM_CAPACITY);

    // Все уходят «одновременно» (в один тик).
    for (const c of members) c.emit('leave', {});

    expect(await waitUntil(() => ctx.registry.count() === 0)).toBe(true);
    expect(ctx.registry.get(roomId)).toBeUndefined();
  }, 20000);

  it('одновременный обрыв ВСЕХ участников (гонка) → count→0', async () => {
    ctx = await startServer();
    const roomId = 'room-race-disconnect';
    const members = await connectMany(ROOM_CAPACITY);
    for (let i = 0; i < members.length; i += 1) {
      expect((await joinResult(members[i], { roomId, name: `U${i}` })).type).toBe('ok');
    }
    expect(ctx.registry.get(roomId).size()).toBe(ROOM_CAPACITY);

    for (const c of members) c.close();

    expect(await waitUntil(() => ctx.registry.count() === 0)).toBe(true);
    expect(ctx.registry.get(roomId)).toBeUndefined();
  }, 20000);

  // --- SEC-11: нет утечки, нельзя «оживить» очищенную комнату --------------

  it('SEC-11: массовые create-then-abandon комнаты → count() возвращается к 0 (нет утечки памяти)', async () => {
    ctx = await startServer();
    const N = 20;
    const created = [];
    for (let i = 0; i < N; i += 1) {
      const [c] = await connectMany(1);
      const res = await joinResult(c, { roomId: `mass-${i}`, name: `M${i}` });
      expect(res.type).toBe('ok');
      created.push(c);
    }
    expect(ctx.registry.count()).toBe(N);

    // Каждый — единственный в своей комнате; обрыв всех должен снести все комнаты.
    for (const c of created) c.close();

    expect(await waitUntil(() => ctx.registry.count() === 0, 5000)).toBe(true);
  }, 30000);

  it('SEC-11: нельзя «оживить» очищенную комнату — повторный вход по тому же roomId создаёт СВЕЖУЮ пустую комнату', async () => {
    ctx = await startServer();
    const roomId = 'room-revive';
    const { client } = await joinOne(roomId, 'Алиса');

    // Наполняем историю ушедшей комнаты, затем выходим последним.
    ctx.registry.get(roomId).pushMessage(
      createChatMessage({ authorId: 'x', authorName: 'Алиса', text: 'секрет' }),
    );
    client.emit('leave', {});
    expect(await waitUntil(() => ctx.registry.get(roomId) === undefined)).toBe(true);

    // Новый участник входит по ТОМУ ЖЕ roomId — должен получить пустую историю,
    // а не остатки прежней комнаты (state не «оживает» старыми данными).
    const [next] = await connectMany(1);
    const res = await joinResult(next, { roomId, name: 'Борис' });
    expect(res.type).toBe('ok');
    expect(res.data.history).toHaveLength(0);
    expect(res.data.participants).toHaveLength(1);
    expect(res.data.participants[0]).toMatchObject({ name: 'Борис' });
    // Это ДРУГОЙ объект комнаты с одним участником.
    expect(ctx.registry.get(roomId).size()).toBe(1);
  }, 15000);

  it('leave по сокету без предшествующего join → безопасный no-op (без error), последующий join работает', async () => {
    ctx = await startServer();
    const [client] = await connectMany(1);

    const errP = waitForEvent(client, 'error', 400);
    client.emit('leave', {});
    expect((await errP).type).toBe('timeout'); // никакой ошибки/краша

    // Соединение исправно — вход после «пустого» leave проходит штатно.
    const res = await joinResult(client, { roomId: 'room-after-noop', name: 'Алиса' });
    expect(res.type).toBe('ok');
    expect(ctx.registry.get('room-after-noop')?.size()).toBe(1);
  }, 15000);
});
