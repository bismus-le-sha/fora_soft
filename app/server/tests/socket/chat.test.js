import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { io as ioClient } from 'socket.io-client';
import { createGateway } from '../../src/socket/gateway.js';
import { registerHandlers } from '../../src/socket/handlers.js';
import { RoomRegistry } from '../../src/domain/RoomRegistry.js';
import * as config from '../../src/config.js';

const { ALLOWED_ORIGIN: TEST_ORIGIN, MESSAGE_MAX } = config;

/**
 * Задача 11 [critical] — Анти-спуфинг авторства + отправка чата (SEC-06).
 *
 * Интеграционные тесты (`socket.io-client` против реального `io` + каркас
 * хендлеров задачи 8), фиксирующие контракт `RoomService.postChat` +
 * `chat:send`-хендлера ДО реализации (test-first, red-фаза). Реализацию делает
 * `implementer` (задача 11.2), НЕ меняя эти тесты.
 *
 * Контракт (Design §6.1/§6.2/§7.4, §5.1, §10.1; Plan §11):
 *   C→S `chat:send { text }` → rate-limit(chat) → `validateText` → `sanitize`
 *   → построить `Message{kind:'chat', authorId=socket.id, authorName=снимок}`
 *   (поля автора/ID/ts/kind из клиентского payload ИГНОРИРУЮТСЯ) → push в
 *   историю комнаты → broadcast `chat:message { id, authorId, authorName,
 *   text, ts }` ВСЕМ в комнате (включая автора — «всем в комнате», §6.2/§7.4).
 *
 * Критерии приёмки (Plan §11, PRD F-12/F-13/F-24/US-8, SEC-02/03/05/06):
 *   - happy-path: авторизованный участник шлёт сообщение → все в комнате
 *     получают `chat:message` с серверным `authorId`(=socket.id) и настоящим
 *     именем; текст тримлен+санитизирован;
 *   - АНТИ-СПУФИНГ (SEC-06): подделанные в payload `authorId`/`authorName`/
 *     `id`/`ts`/`kind` игнорируются — сервер проставляет собственные значения;
 *     нельзя выдать себя за другого участника (даже используя его реальный
 *     socket.id/имя);
 *   - валидация (SEC-02): пустой/пробельный/не-строковый/слишком длинный текст
 *     → сообщение НЕ рассылается (отклонено), без падения сервера;
 *   - санитизация (SEC-03): XSS-пейлоад нейтрализуется (нет сырых `<`/`>`) и в
 *     broadcast, и в сохранённой истории;
 *   - серверное авторство хранится и в истории комнаты (не клиентское);
 *   - отправка без валидной сессии (до `join`) → безопасный no-op, ничего не
 *     утекает в чужие комнаты, сервер жив.
 *
 * Серверное состояние проверяется по РЕАЛЬНОЙ модели: в `deps` пробрасываем
 * собственный `RoomRegistry`, чтобы читать `room.snapshot().history`.
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
 * Ждёт `chat:message` не дольше `timeoutMs`. `{type:'message', data}` при
 * доставке, иначе `{type:'timeout'}` — в red-фазе (стаб `postChat` ничего не
 * шлёт) это превращает «нет события» в явную ассерцию, а не в зависание.
 */
function nextChat(emitter, timeoutMs = 800) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ type: 'timeout' }), timeoutMs);
    emitter.once('chat:message', (data) => {
      clearTimeout(t);
      resolve({ type: 'message', data });
    });
  });
}

describe('socket chat:send — анти-спуфинг авторства (SEC-06, US-8; Design §5.1/§6.1/§7.4/§10.1)', () => {
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

  it('участник шлёт сообщение → chat:message приходит и другому участнику, и самому автору (всем в комнате)', async () => {
    ctx = await startServer();
    const roomId = 'room-chat';
    const { client: a, selfId: aId } = await joinOne(roomId, 'Алиса');
    const [b] = await connectMany(1);
    expect((await joinResult(b, { roomId, name: 'Борис' })).type).toBe('ok');

    const onB = nextChat(b);
    const onA = nextChat(a);
    a.emit('chat:send', { text: 'привет' });

    const rb = await onB;
    const ra = await onA;
    expect(rb.type).toBe('message');
    expect(ra.type).toBe('message');

    for (const { data } of [rb, ra]) {
      expect(typeof data.id).toBe('string');
      expect(data.id.length).toBeGreaterThan(0);
      expect(data.authorId).toBe(aId);
      expect(data.authorName).toBe('Алиса');
      expect(data.text).toBe('привет');
      expect(typeof data.ts).toBe('number');
      expect(data.ts).toBeGreaterThan(0);
    }
    // Оба получателя видят один и тот же message id (одно сообщение, не два).
    expect(rb.data.id).toBe(ra.data.id);
  }, 15000);

  it('текст с окружающими пробелами тримится в broadcast (validateText trim)', async () => {
    ctx = await startServer();
    const roomId = 'room-trim';
    const { client: a } = await joinOne(roomId, 'Алиса');
    const [b] = await connectMany(1);
    expect((await joinResult(b, { roomId, name: 'Борис' })).type).toBe('ok');

    const onB = nextChat(b);
    a.emit('chat:send', { text: '   привет   ' });

    const rb = await onB;
    expect(rb.type).toBe('message');
    expect(rb.data.text).toBe('привет');
  }, 15000);

  it('сообщение доставляется ВСЕМ остальным в комнате (3 участника)', async () => {
    ctx = await startServer();
    const roomId = 'room-multi';
    const { client: a, selfId: aId } = await joinOne(roomId, 'Алиса');
    const [b, c] = await connectMany(2);
    expect((await joinResult(b, { roomId, name: 'Борис' })).type).toBe('ok');
    expect((await joinResult(c, { roomId, name: 'Виктор' })).type).toBe('ok');

    const onB = nextChat(b);
    const onC = nextChat(c);
    a.emit('chat:send', { text: 'всем привет' });

    const rb = await onB;
    const rc = await onC;
    expect(rb.type).toBe('message');
    expect(rc.type).toBe('message');
    expect(rb.data).toMatchObject({ authorId: aId, authorName: 'Алиса', text: 'всем привет' });
    expect(rc.data).toMatchObject({ authorId: aId, authorName: 'Алиса', text: 'всем привет' });
  }, 15000);

  // --- АНТИ-СПУФИНГ (SEC-06) ----------------------------------------------

  it('SEC-06: подделанные authorId/authorName/id/ts/kind в payload ИГНОРИРУЮТСЯ — сервер ставит свои', async () => {
    ctx = await startServer();
    const roomId = 'room-spoof';
    const { client: a, selfId: aId } = await joinOne(roomId, 'Алиса');
    const [b] = await connectMany(1);
    expect((await joinResult(b, { roomId, name: 'Борис' })).type).toBe('ok');

    const onB = nextChat(b);
    a.emit('chat:send', {
      text: 'реальный текст',
      authorId: 'HACKER-SOCKET-ID',
      authorName: 'Администратор',
      id: 'fake-message-id',
      ts: 1,
      kind: 'system',
    });

    const rb = await onB;
    expect(rb.type).toBe('message');
    const { data } = rb;
    // Авторство — из серверной сессии/сокета, НЕ из payload.
    expect(data.authorId).toBe(aId);
    expect(data.authorName).toBe('Алиса');
    expect(data.text).toBe('реальный текст');
    // Ни одно подделанное поле не пролезло.
    expect(data.authorId).not.toBe('HACKER-SOCKET-ID');
    expect(data.authorName).not.toBe('Администратор');
    expect(data.id).not.toBe('fake-message-id');
    expect(data.ts).not.toBe(1);
    // Серверный id/ts осмысленны.
    expect(typeof data.id).toBe('string');
    expect(data.id.length).toBeGreaterThan(0);
    expect(data.ts).toBeGreaterThan(1);
  }, 15000);

  it('SEC-06: нельзя выдать себя за ДРУГОГО участника — даже с его реальным socket.id/именем', async () => {
    ctx = await startServer();
    const roomId = 'room-impersonate';
    const { client: a, selfId: aId } = await joinOne(roomId, 'Алиса');
    const [b] = await connectMany(1);
    const bJoin = await joinResult(b, { roomId, name: 'Борис' });
    expect(bJoin.type).toBe('ok');
    const bId = bJoin.data.selfId;

    // Борис пытается отправить сообщение ОТ ИМЕНИ Алисы (её реальный id/имя).
    const onA = nextChat(a);
    b.emit('chat:send', { text: 'я как будто Алиса', authorId: aId, authorName: 'Алиса' });

    const ra = await onA;
    expect(ra.type).toBe('message');
    // Сервер атрибутирует сообщение реальному отправителю (Борису), а не Алисе.
    expect(ra.data.authorId).toBe(bId);
    expect(ra.data.authorName).toBe('Борис');
    expect(ra.data.authorId).not.toBe(aId);
    expect(ra.data.authorName).not.toBe('Алиса');
  }, 15000);

  it('SEC-06: авторство в СОХРАНЁННОЙ истории комнаты тоже серверное (не клиентское)', async () => {
    ctx = await startServer();
    const roomId = 'room-history-author';
    const { client: a, selfId: aId } = await joinOne(roomId, 'Алиса');
    const [b] = await connectMany(1);
    expect((await joinResult(b, { roomId, name: 'Борис' })).type).toBe('ok');

    const onB = nextChat(b);
    a.emit('chat:send', {
      text: 'в историю',
      authorId: 'SPOOF',
      authorName: 'НеАлиса',
    });
    expect((await onB).type).toBe('message');

    // Сообщение осело в истории комнаты с серверным авторством (задача 11:
    // «push в историю»; поздний вход задачи 12 увидит именно это).
    const history = ctx.registry.get(roomId).snapshot().history;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      kind: 'chat',
      authorId: aId,
      authorName: 'Алиса',
      text: 'в историю',
    });
    expect(history[0].authorId).not.toBe('SPOOF');
    expect(history[0].authorName).not.toBe('НеАлиса');
  }, 15000);

  // --- валидация текста (SEC-02): отклонённые сообщения не рассылаются ------

  it('пустой текст → сообщение НЕ рассылается (отклонено)', async () => {
    ctx = await startServer();
    const roomId = 'room-empty';
    const { client: a } = await joinOne(roomId, 'Алиса');
    const [b] = await connectMany(1);
    expect((await joinResult(b, { roomId, name: 'Борис' })).type).toBe('ok');

    const onB = nextChat(b);
    a.emit('chat:send', { text: '' });
    expect((await onB).type).toBe('timeout');
  }, 15000);

  it('пробельный текст → сообщение НЕ рассылается', async () => {
    ctx = await startServer();
    const roomId = 'room-ws';
    const { client: a } = await joinOne(roomId, 'Алиса');
    const [b] = await connectMany(1);
    expect((await joinResult(b, { roomId, name: 'Борис' })).type).toBe('ok');

    const onB = nextChat(b);
    a.emit('chat:send', { text: '   \t\n  ' });
    expect((await onB).type).toBe('timeout');
  }, 15000);

  it('отсутствующее поле text → сообщение НЕ рассылается, без краша', async () => {
    ctx = await startServer();
    const roomId = 'room-notext';
    const { client: a } = await joinOne(roomId, 'Алиса');
    const [b] = await connectMany(1);
    expect((await joinResult(b, { roomId, name: 'Борис' })).type).toBe('ok');

    const onB = nextChat(b);
    a.emit('chat:send', {});
    expect((await onB).type).toBe('timeout');

    // Сервер жив: валидное сообщение после этого проходит штатно.
    const onB2 = nextChat(b);
    a.emit('chat:send', { text: 'теперь ок' });
    const rb = await onB2;
    expect(rb.type).toBe('message');
    expect(rb.data.text).toBe('теперь ок');
  }, 15000);

  it('не-строковый text (число) → сообщение НЕ рассылается', async () => {
    ctx = await startServer();
    const roomId = 'room-nonstr';
    const { client: a } = await joinOne(roomId, 'Алиса');
    const [b] = await connectMany(1);
    expect((await joinResult(b, { roomId, name: 'Борис' })).type).toBe('ok');

    const onB = nextChat(b);
    a.emit('chat:send', { text: 123456 });
    expect((await onB).type).toBe('timeout');
  }, 15000);

  it('слишком длинный текст (> MESSAGE_MAX) → сообщение НЕ рассылается (SEC-02/08)', async () => {
    ctx = await startServer();
    const roomId = 'room-long';
    const { client: a } = await joinOne(roomId, 'Алиса');
    const [b] = await connectMany(1);
    expect((await joinResult(b, { roomId, name: 'Борис' })).type).toBe('ok');

    const onB = nextChat(b);
    a.emit('chat:send', { text: 'a'.repeat(MESSAGE_MAX + 1) });
    expect((await onB).type).toBe('timeout');
  }, 15000);

  // --- санитизация (SEC-03): XSS-пейлоад нейтрализуется --------------------

  it('SEC-03: XSS-пейлоад в тексте санитизируется (нет сырых < >) и в broadcast, и в истории', async () => {
    ctx = await startServer();
    const roomId = 'room-xss';
    const { client: a } = await joinOne(roomId, 'Алиса');
    const [b] = await connectMany(1);
    expect((await joinResult(b, { roomId, name: 'Борис' })).type).toBe('ok');

    const onB = nextChat(b);
    a.emit('chat:send', { text: '<script>alert(1)</script>' });

    const rb = await onB;
    expect(rb.type).toBe('message');
    expect(rb.data.text).not.toMatch(/[<>]/);
    expect(rb.data.text).toContain('alert(1)');

    const history = ctx.registry.get(roomId).snapshot().history;
    expect(history).toHaveLength(1);
    expect(history[0].text).not.toMatch(/[<>]/);
  }, 15000);

  // --- сессия/сокет: отправка без валидного join --------------------------

  it('SEC-06: chat:send ДО join → безопасный no-op, ничего не утекает в чужую комнату, сервер жив', async () => {
    ctx = await startServer();
    // Наблюдатель в отдельной комнате — не должен получить чужую инъекцию.
    const observerRoom = 'room-observer';
    const { client: observer } = await joinOne(observerRoom, 'Наблюдатель');

    // Не вошедший клиент шлёт chat:send (в т.ч. с подделанным authorId).
    const [ghost] = await connectMany(1);
    const onObserver = nextChat(observer);
    const onGhost = nextChat(ghost);
    ghost.emit('chat:send', { text: 'инъекция', authorId: observer.id });

    expect((await onObserver).type).toBe('timeout');
    expect((await onGhost).type).toBe('timeout');

    // Сервер жив: ghost затем корректно входит и его сообщение работает.
    const gJoin = await joinResult(ghost, { roomId: 'room-ghost', name: 'Гость' });
    expect(gJoin.type).toBe('ok');
    const onGhost2 = nextChat(ghost);
    ghost.emit('chat:send', { text: 'после входа' });
    const rg = await onGhost2;
    expect(rg.type).toBe('message');
    expect(rg.data).toMatchObject({ authorId: gJoin.data.selfId, authorName: 'Гость', text: 'после входа' });
  }, 15000);
});
