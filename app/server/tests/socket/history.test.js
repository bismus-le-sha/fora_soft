import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { io as ioClient } from 'socket.io-client';
import { createGateway } from '../../src/socket/gateway.js';
import { registerHandlers } from '../../src/socket/handlers.js';
import { RoomRegistry } from '../../src/domain/RoomRegistry.js';
import { createChatMessage } from '../../src/domain/Message.js';
import * as config from '../../src/config.js';

const { ALLOWED_ORIGIN: TEST_ORIGIN, HISTORY_MAX } = config;

/**
 * Задача 12 [critical] — История чата при позднем входе (F-14/23, US-8, SEC-09).
 *
 * Интеграционные тесты (`socket.io-client` против реального `io` + каркас
 * хендлеров задачи 8), фиксирующие контракт «поздний вход видит историю» ДО
 * реализации (test-first, red-фаза). Реализацию делает `implementer`
 * (задача 12.2), НЕ меняя эти тесты.
 *
 * Контракт (PRD F-14; Design §5.1/§5.2/§6.2/§11.2; Plan §12):
 *   Участник, вошедший ПОЗЖЕ, получает в `join:ok.history` все чат-сообщения,
 *   отправленные в комнату ДО его входа (за время жизни комнаты), в порядке
 *   отправки, с СЕРВЕРНЫМ авторством (`authorId`/`authorName`) и серверным
 *   `ts`. История — ring-buffer с cap `HISTORY_MAX` (SEC-09): сверх лимита
 *   вытесняется старейшее, поздний вход видит последние `HISTORY_MAX`.
 *
 * Критерии приёмки (Plan §12, PRD F-14/US-8):
 *   - happy-path: A шлёт N сообщений → вошедший позже B видит их в
 *     `join:ok.history` в правильном порядке, с авторами и временем;
 *   - пустая история: вход в комнату без переписки → `history: []`;
 *   - поздний вход посреди диалога нескольких участников → полная история;
 *   - ring-buffer `HISTORY_MAX`: при > `HISTORY_MAX` хранятся ПОСЛЕДНИЕ, а не
 *     первые (SEC-09);
 *   - авторство в истории не подделывается (серверное, SEC-06);
 *   - изоляция комнат: история одной комнаты не утекает в `join:ok` другой;
 *   - после удаления комнаты (выход/обрыв последнего, задача 10) история
 *     недоступна — новый вход по тому же `roomId` видит пустую историю (SEC-11).
 *
 * Серверное состояние читается по РЕАЛЬНОЙ модели: в `deps` пробрасываем
 * собственный `RoomRegistry` (для предзаполнения ring-buffer сверх `HISTORY_MAX`
 * без обхода rate-limit чата и для проверки удаления комнаты).
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

/** Ждёт `chat:message` не дольше `timeoutMs` (подтверждение, что сообщение осело). */
function nextChat(emitter, timeoutMs = 800) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ type: 'timeout' }), timeoutMs);
    emitter.once('chat:message', (data) => {
      clearTimeout(t);
      resolve({ type: 'message', data });
    });
  });
}

describe('socket join:ok.history — история чата при позднем входе (F-14/23, US-8, SEC-09; Design §5.1/§6.2/§11.2)', () => {
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

  /** Подключает клиента и вводит его в комнату; возвращает {client, selfId, data}. */
  async function joinOne(roomId, name) {
    const [client] = await connectMany(1);
    const res = await joinResult(client, { roomId, name });
    expect(res.type).toBe('ok');
    return { client, selfId: res.data.selfId, data: res.data };
  }

  /**
   * Отправляет `text` от имени `client` и ждёт подтверждения `chat:message`
   * (сообщение осело в истории комнаты). Держит N ≤ лимита rate-limit(chat).
   */
  async function send(client, text) {
    const echo = nextChat(client);
    client.emit('chat:send', { text });
    const r = await echo;
    expect(r.type).toBe('message');
    return r.data;
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

  // --- happy-path: поздний вход видит переписку ---------------------------

  it('A шлёт несколько сообщений → вошедший ПОЗЖЕ B видит их в join:ok.history (в порядке, с авторами/временем)', async () => {
    ctx = await startServer();
    const roomId = 'room-late';
    const { client: a, selfId: aId } = await joinOne(roomId, 'Алиса');

    await send(a, 'первое');
    await send(a, 'второе');
    await send(a, 'третье');

    // B входит ПОЗЖЕ — должен получить всю предыдущую переписку.
    const bJoin = await joinOne(roomId, 'Борис');
    const history = bJoin.data.history;

    expect(Array.isArray(history)).toBe(true);
    const chats = history.filter((m) => m.kind === 'chat');
    expect(chats.map((m) => m.text)).toEqual(['первое', 'второе', 'третье']);

    for (const m of chats) {
      expect(m.authorId).toBe(aId);
      expect(m.authorName).toBe('Алиса');
      expect(typeof m.ts).toBe('number');
      expect(m.ts).toBeGreaterThan(0);
      expect(typeof m.id).toBe('string');
      expect(m.id.length).toBeGreaterThan(0);
    }
    // Порядок по времени неубывающий.
    for (let i = 1; i < chats.length; i += 1) {
      expect(chats[i].ts).toBeGreaterThanOrEqual(chats[i - 1].ts);
    }
  }, 15000);

  it('пустая история: вход в комнату без переписки → join:ok.history === [] (chat-сообщений нет)', async () => {
    ctx = await startServer();
    const bJoin = await joinOne('room-empty-history', 'Алиса');
    const history = bJoin.data.history;
    expect(Array.isArray(history)).toBe(true);
    expect(history.filter((m) => m.kind === 'chat')).toHaveLength(0);
  }, 15000);

  it('поздний вход ПОСРЕДИ диалога нескольких участников → полная история от всех', async () => {
    ctx = await startServer();
    const roomId = 'room-dialog';
    const { client: a, selfId: aId } = await joinOne(roomId, 'Алиса');
    const { client: b, selfId: bId } = await joinOne(roomId, 'Борис');

    await send(a, 'привет от Алисы');
    await send(b, 'привет от Бориса');
    await send(a, 'как дела?');

    // C входит посреди диалога.
    const cJoin = await joinOne(roomId, 'Виктор');
    const chats = cJoin.data.history.filter((m) => m.kind === 'chat');

    expect(chats.map((m) => m.text)).toEqual([
      'привет от Алисы',
      'привет от Бориса',
      'как дела?',
    ]);
    expect(chats.map((m) => m.authorId)).toEqual([aId, bId, aId]);
    expect(chats.map((m) => m.authorName)).toEqual(['Алиса', 'Борис', 'Алиса']);
  }, 15000);

  // --- ring-buffer HISTORY_MAX (SEC-09) -----------------------------------

  it('SEC-09: при > HISTORY_MAX сообщений поздний вход видит ПОСЛЕДНИЕ HISTORY_MAX (старейшее вытеснено)', async () => {
    ctx = await startServer();
    const roomId = 'room-overflow';
    // A создаёт комнату; затем предзаполняем историю сверх лимита напрямую
    // через реальную модель (postChat/rate-limit не позволил бы отправить
    // HISTORY_MAX+ сообщений в тесте) — так же, как это делает postChat:
    // room.pushMessage(message) с серверным авторством.
    await joinOne(roomId, 'Алиса');
    const room = ctx.registry.get(roomId);
    expect(room).toBeTruthy();

    const overflow = HISTORY_MAX + 5;
    for (let i = 0; i < overflow; i += 1) {
      room.pushMessage(
        createChatMessage({ authorId: 'srv', authorName: 'Алиса', text: `m${i}` }),
      );
    }

    // B входит после переполнения — видит ровно последние HISTORY_MAX.
    const bJoin = await joinOne(roomId, 'Борис');
    const chats = bJoin.data.history.filter((m) => m.kind === 'chat');

    expect(chats).toHaveLength(HISTORY_MAX);
    // Старейшие (m0..m4) вытеснены; первым идёт m5, последним — m{overflow-1}.
    expect(chats[0].text).toBe('m5');
    expect(chats[chats.length - 1].text).toBe(`m${overflow - 1}`);
    // Вытесненного старейшего сообщения в истории нет.
    expect(chats.some((m) => m.text === 'm0')).toBe(false);
  }, 15000);

  // --- авторство истории серверное (SEC-06 в связке с историей) -----------

  it('SEC-06: авторство в join:ok.history серверное — подделанные authorId/authorName в payload не пролезают в историю позднего входа', async () => {
    ctx = await startServer();
    const roomId = 'room-hist-spoof';
    const { client: a, selfId: aId } = await joinOne(roomId, 'Алиса');

    const echo = nextChat(a);
    a.emit('chat:send', {
      text: 'честный текст',
      authorId: 'HACKER',
      authorName: 'Администратор',
    });
    expect((await echo).type).toBe('message');

    const bJoin = await joinOne(roomId, 'Борис');
    const chats = bJoin.data.history.filter((m) => m.kind === 'chat');
    expect(chats).toHaveLength(1);
    expect(chats[0].authorId).toBe(aId);
    expect(chats[0].authorName).toBe('Алиса');
    expect(chats[0].authorId).not.toBe('HACKER');
    expect(chats[0].authorName).not.toBe('Администратор');
    expect(chats[0].text).toBe('честный текст');
  }, 15000);

  // --- изоляция комнат ----------------------------------------------------

  it('изоляция: история одной комнаты НЕ утекает в join:ok.history другой комнаты', async () => {
    ctx = await startServer();
    const { client: a } = await joinOne('room-X', 'Алиса');
    await send(a, 'секрет комнаты X');

    // Поздний вход в ДРУГУЮ комнату не должен видеть переписку комнаты X.
    const bJoin = await joinOne('room-Y', 'Борис');
    const chats = bJoin.data.history.filter((m) => m.kind === 'chat');
    expect(chats.some((m) => m.text === 'секрет комнаты X')).toBe(false);
    expect(chats).toHaveLength(0);
  }, 15000);

  // --- после удаления комнаты история недоступна (связка с задачей 10) -----

  it('SEC-11: после выхода последнего участника история стирается — новый вход по тому же roomId видит пустую историю', async () => {
    ctx = await startServer();
    const roomId = 'room-recycled';
    const { client: a } = await joinOne(roomId, 'Алиса');
    await send(a, 'сообщение до удаления комнаты');

    // Последний участник выходит → комната (и история) удаляется (задача 10).
    a.emit('leave', {});
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(ctx.registry.get(roomId)).toBeFalsy();

    // Новый вход по тому же roomId — свежая комната, история пуста.
    const bJoin = await joinOne(roomId, 'Борис');
    const chats = bJoin.data.history.filter((m) => m.kind === 'chat');
    expect(chats).toHaveLength(0);
    expect(chats.some((m) => m.text === 'сообщение до удаления комнаты')).toBe(false);
  }, 15000);
});
