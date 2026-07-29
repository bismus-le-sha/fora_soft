import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { io as ioClient } from 'socket.io-client';
import { createGateway } from '../../src/socket/gateway.js';
import { registerHandlers } from '../../src/socket/handlers.js';
import { RoomRegistry } from '../../src/domain/RoomRegistry.js';
import * as config from '../../src/config.js';

const { ALLOWED_ORIGIN: TEST_ORIGIN, ROOM_CAPACITY, ICE_SERVERS } = config;

/**
 * Задача 9 [critical] — Атомарный join и лимит 4 участника (SEC-07).
 *
 * Интеграционные тесты (`socket.io-client` против реального `io` + каркас
 * хендлеров задачи 8), фиксирующие контракт `RoomService.join` + `join`-хендлера
 * ДО реализации (test-first, red-фаза). Реализацию делает `implementer`
 * (задача 9.2), НЕ меняя эти тесты.
 *
 * Критерии приёмки (Plan §9, Design §4.1/§6.1/§7.1/§10.2, PRD US-5/SEC-07):
 *   - happy-path: вход при <4 участниках → `join:ok{selfId, participants,
 *     history, iceServers}`; старожилы получают `participant:joined` +
 *     `chat:system{join}`;
 *   - лимит: 5-й участник → `join:rejected{code:'room-full'}`, слот не занят;
 *   - невалидное имя → `join:rejected{code:'invalid-name'}`, слот не занят;
 *   - АТОМАРНОСТЬ (SEC-07): при гонке одновременных join лимит 4 не
 *     превышается — ровно ROOM_CAPACITY получают `join:ok`, остальные
 *     `room-full`; серверное состояние комнаты никогда не > ROOM_CAPACITY.
 *
 * Инвариант проверяется по РЕАЛЬНОМУ серверному состоянию: в `deps` пробрасываем
 * собственный `RoomRegistry`, чтобы после гонки прочитать `room.size()`, а не
 * доверять только числу ответов `join:ok`.
 */

/**
 * Поднимает gateway + каркас хендлеров с ВНЕДРЁННЫМ реестром (для проверки
 * серверного состояния комнаты). `RoomService` — реальный (дефолтный), т.к.
 * именно его атомарность тестируем.
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
 * Эмитит `join` и резолвит первым из `join:ok` / `join:rejected`. Внутренний
 * таймаут превращает «нет ответа» (напр. стаб RoomService в red-фазе) в явный
 * `{ type: 'timeout' }`, чтобы падение было понятной ассерцией, а не зависанием.
 */
function joinResult(client, payload, timeoutMs = 1000) {
  const p = new Promise((resolve) => {
    client.once('join:ok', (data) => resolve({ type: 'ok', data }));
    client.once('join:rejected', (data) => resolve({ type: 'rejected', data }));
    setTimeout(() => resolve({ type: 'timeout' }), timeoutMs);
  });
  client.emit('join', payload);
  return p;
}

describe('socket join — атомарный лимит 4 (SEC-07, US-5; Design §4.1/§6.1/§7.1/§10.2)', () => {
  /** @type {{httpServer: import('node:http').Server, io: import('socket.io').Server, registry: RoomRegistry, url: string} | undefined} */
  let ctx;
  /** @type {import('socket.io-client').Socket[]} */
  let clients = [];

  function makeClient() {
    const client = connectClient(ctx.url);
    clients.push(client);
    return client;
  }

  /** Подключает N клиентов и дожидается `connect` каждого. */
  async function connectMany(n) {
    const list = Array.from({ length: n }, () => makeClient());
    await Promise.all(list.map((c) => waitFor(c, 'connect')));
    return list;
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

  it('первый вход в новую комнату → join:ok со снимком состояния (selfId/participants/history/iceServers)', async () => {
    ctx = await startServer();
    const [client] = await connectMany(1);

    const res = await joinResult(client, { roomId: 'room-happy', name: 'Алиса' });

    expect(res.type).toBe('ok');
    const { selfId, participants, history, iceServers } = res.data;
    expect(typeof selfId).toBe('string');
    expect(selfId.length).toBeGreaterThan(0);
    // participants — снимок с самим собой; id участника == selfId (== socket.id).
    expect(Array.isArray(participants)).toBe(true);
    expect(participants).toHaveLength(1);
    expect(participants[0]).toMatchObject({ id: selfId, name: 'Алиса' });
    expect(participants[0].media).toMatchObject({ audio: expect.any(Boolean), video: expect.any(Boolean) });
    // Поздний вход видит историю; у первого — пусто (Design §6.2, задача 12).
    expect(Array.isArray(history)).toBe(true);
    expect(history).toHaveLength(0);
    // ICE-конфиг дублируется в join:ok (SEC-17, Design §6.2).
    expect(Array.isArray(iceServers)).toBe(true);
    expect(iceServers.length).toBeGreaterThan(0);
    expect(iceServers).toEqual(expect.arrayContaining([
      expect.objectContaining({ urls: expect.stringMatching(/^stun:/) }),
    ]));

    // Серверное состояние: ровно один участник.
    expect(ctx.registry.get('room-happy')?.size()).toBe(1);
  }, 15000);

  it('вход имени с окружающими пробелами возвращает тримленное имя (validate+sanitize в пайплайне join)', async () => {
    ctx = await startServer();
    const [client] = await connectMany(1);

    const res = await joinResult(client, { roomId: 'room-trim', name: '  Алиса  ' });

    expect(res.type).toBe('ok');
    expect(res.data.participants[0].name).toBe('Алиса');
  }, 15000);

  it('второй участник → старожил получает participant:joined и chat:system{join}, а сам видит участников 2', async () => {
    ctx = await startServer();
    const [a, b] = await connectMany(2);

    const aJoin = await joinResult(a, { roomId: 'room-2', name: 'Алиса' });
    expect(aJoin.type).toBe('ok');

    const joinedP = waitFor(a, 'participant:joined');
    const systemP = waitFor(a, 'chat:system');

    const bJoin = await joinResult(b, { roomId: 'room-2', name: 'Борис' });
    expect(bJoin.type).toBe('ok');
    expect(bJoin.data.participants).toHaveLength(2);
    expect(bJoin.data.participants.map((p) => p.name).sort()).toEqual(['Алиса', 'Борис']);

    const joined = await joinedP;
    expect(joined).toMatchObject({ name: 'Борис' });
    expect(typeof joined.id).toBe('string');
    expect(joined.media).toMatchObject({ audio: expect.any(Boolean), video: expect.any(Boolean) });

    const system = await systemP;
    expect(system).toMatchObject({ event: 'join', subjectName: 'Борис' });

    expect(ctx.registry.get('room-2')?.size()).toBe(2);
  }, 15000);

  // --- ошибки / edge-cases ------------------------------------------------

  it('невалидное (пустое) имя → join:rejected{invalid-name}, слот не занимается', async () => {
    ctx = await startServer();
    const [client] = await connectMany(1);

    const res = await joinResult(client, { roomId: 'room-inv', name: '   ' });

    expect(res.type).toBe('rejected');
    expect(res.data.code).toBe('invalid-name');
    // Комната не создана либо пуста — отклонённый вход слот не занимает.
    expect(ctx.registry.get('room-inv')?.size() ?? 0).toBe(0);
  }, 15000);

  it('имя с недопустимыми символами (XSS-пейлоад) → join:rejected{invalid-name}', async () => {
    ctx = await startServer();
    const [client] = await connectMany(1);

    const res = await joinResult(client, {
      roomId: 'room-xss',
      name: '<img src=x onerror=alert(1)>',
    });

    expect(res.type).toBe('rejected');
    expect(res.data.code).toBe('invalid-name');
    expect(ctx.registry.get('room-xss')?.size() ?? 0).toBe(0);
  }, 15000);

  it('5-й участник (после 4 последовательных входов) → join:rejected{room-full}, в комнате остаётся ровно 4', async () => {
    ctx = await startServer();
    const roomId = 'room-full-seq';
    const four = await connectMany(ROOM_CAPACITY);

    for (let i = 0; i < four.length; i += 1) {
      const res = await joinResult(four[i], { roomId, name: `U${i}` });
      expect(res.type).toBe('ok');
    }
    expect(ctx.registry.get(roomId)?.size()).toBe(ROOM_CAPACITY);

    const [fifth] = await connectMany(1);
    const res = await joinResult(fifth, { roomId, name: 'Fifth' });

    expect(res.type).toBe('rejected');
    expect(res.data.code).toBe('room-full');
    expect(ctx.registry.get(roomId)?.size()).toBe(ROOM_CAPACITY);
  }, 20000);

  // --- атомарность / гонка за слот (SEC-07) -------------------------------

  it('АТОМАРНОСТЬ: пустая комната, ROOM_CAPACITY+2 одновременных join → ровно ROOM_CAPACITY ok, остальные room-full', async () => {
    ctx = await startServer();
    const roomId = 'room-race';
    const n = ROOM_CAPACITY + 2;
    const racers = await connectMany(n);

    // Все join уходят «одновременно» (в один тик), затем собираем результаты.
    const results = await Promise.all(
      racers.map((c, i) => joinResult(c, { roomId, name: `R${i}` })),
    );

    const ok = results.filter((r) => r.type === 'ok');
    const rejected = results.filter((r) => r.type === 'rejected');

    expect(ok).toHaveLength(ROOM_CAPACITY);
    expect(rejected).toHaveLength(n - ROOM_CAPACITY);
    expect(rejected.every((r) => r.data.code === 'room-full')).toBe(true);
    // ни один join не остался без ответа (нет timeout).
    expect(results.some((r) => r.type === 'timeout')).toBe(false);

    // Ключевой инвариант SEC-07: серверное состояние НИКОГДА не превышает лимит.
    expect(ctx.registry.get(roomId).size()).toBe(ROOM_CAPACITY);
    expect(ctx.registry.get(roomId).size()).toBeLessThanOrEqual(ROOM_CAPACITY);
  }, 20000);

  it('АТОМАРНОСТЬ (US-5): комната из 3, затем 2 одновременных join → входит ровно 1, второй получает room-full', async () => {
    ctx = await startServer();
    const roomId = 'room-last-slot';

    const seated = await connectMany(3);
    for (let i = 0; i < seated.length; i += 1) {
      const res = await joinResult(seated[i], { roomId, name: `S${i}` });
      expect(res.type).toBe('ok');
    }
    expect(ctx.registry.get(roomId).size()).toBe(3);

    const contenders = await connectMany(2);
    const results = await Promise.all(
      contenders.map((c, i) => joinResult(c, { roomId, name: `C${i}` })),
    );

    const ok = results.filter((r) => r.type === 'ok');
    const rejected = results.filter((r) => r.type === 'rejected');
    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].data.code).toBe('room-full');
    expect(ctx.registry.get(roomId).size()).toBe(ROOM_CAPACITY);
  }, 20000);

  // --- double-join guard (SEC-11, post-review находка задачи 10) ----------

  it('повторный join на уже вошедшем сокете (другой roomId) отклоняется без краша, комната A не теряет участника', async () => {
    ctx = await startServer();
    const [client] = await connectMany(1);

    const first = await joinResult(client, { roomId: 'room-a', name: 'Алиса' });
    expect(first.type).toBe('ok');
    expect(ctx.registry.get('room-a')?.size()).toBe(1);

    // Тот же сокет повторно шлёт join с ДРУГИМ roomId — должен быть безопасно
    // отклонён (без падения процесса), не создавая «призрачного» участника
    // в новой комнате и не бросая старую комнату без владельца.
    const errP = waitFor(client, 'error');
    client.emit('join', { roomId: 'room-b', name: 'Алиса' });
    const err = await errP;
    expect(err).toMatchObject({ code: 'bad-payload' });

    // Комната B не создана (либо пуста) — второй join не занял в ней слот.
    expect(ctx.registry.get('room-b')?.size() ?? 0).toBe(0);
    // Комната A по-прежнему держит первого участника — не потеряна.
    expect(ctx.registry.get('room-a')?.size()).toBe(1);

    // leave() очищает корректно именно комнату A (а не оставляет её висеть).
    client.emit('leave', {});
    const cleaned = await new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        if (ctx.registry.get('room-a') === undefined) return resolve(true);
        if (Date.now() - start >= 2000) return resolve(false);
        setTimeout(check, 20);
      };
      check();
    });
    expect(cleaned).toBe(true);
    expect(ctx.registry.count()).toBe(0);
  }, 15000);
});
