import { describe, it, expect, vi } from 'vitest';
import { createSignalingClient } from '../src/signalingClient.js';

/**
 * TDD §4.2/§6/§8, F-35, US-13. Юнит-тесты изолируют `signalingClient.js` от
 * реального сетевого соединения через DI-параметр `deps.io` (фейковая
 * фабрика сокета) — тот же приём, что `target` в `lib/compat.js` (задача 17).
 * Критерий приёмки задачи 18: «`connect_error` вызывает `onError`; обёртка
 * эмитит/подписывается на события контракта §6».
 */

/** Минимальный фейковый EventEmitter-подобный сокет socket.io-client. */
function createFakeSocket() {
  const listeners = new Map();
  return {
    emit: vi.fn(),
    on: vi.fn((event, cb) => {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event).add(cb);
    }),
    off: vi.fn((event, cb) => {
      listeners.get(event)?.delete(cb);
    }),
    disconnect: vi.fn(),
    // Тестовый хелпер — не часть реального API socket.io-client.
    __trigger(event, ...args) {
      for (const cb of listeners.get(event) ?? new Set()) {
        cb(...args);
      }
    },
  };
}

describe('signalingClient (Design §4.2/§6/§8, F-35, US-13)', () => {
  describe('connect()', () => {
    it('создаёт сокет через инъецированную io-фабрику ровно один раз (идемпотентность)', () => {
      const fakeSocket = createFakeSocket();
      const ioFactory = vi.fn(() => fakeSocket);
      const client = createSignalingClient({ io: ioFactory, url: 'https://example.test' });

      const s1 = client.connect();
      const s2 = client.connect();

      expect(ioFactory).toHaveBeenCalledTimes(1);
      expect(s1).toBe(fakeSocket);
      expect(s2).toBe(fakeSocket);
    });

    it('передаёт сконфигурированный непустой url в io-фабрику как есть', () => {
      const ioFactory = vi.fn(() => createFakeSocket());
      const client = createSignalingClient({ io: ioFactory, url: 'https://example.test' });

      client.connect();

      expect(ioFactory).toHaveBeenCalledWith('https://example.test', expect.any(Object));
    });

    it('пустой url (SIGNALING_URL="" — тот же origin, Design §4.2/§9.3) передаётся в io-фабрику как undefined, не как пустая строка', () => {
      const ioFactory = vi.fn(() => createFakeSocket());
      const client = createSignalingClient({ io: ioFactory, url: '' });

      client.connect();

      expect(ioFactory).toHaveBeenCalledWith(undefined, expect.any(Object));
    });

    it('без деп-инъекции url по умолчанию использует config.SIGNALING_URL (не бросает)', () => {
      const ioFactory = vi.fn(() => createFakeSocket());
      const client = createSignalingClient({ io: ioFactory });

      expect(() => client.connect()).not.toThrow();
      expect(ioFactory).toHaveBeenCalledTimes(1);
    });
  });

  describe('реэмиссия ошибок соединения — onError() (US-13 «сервер недоступен», Design §8)', () => {
    it('connect_error реэмитится всем подписчикам onError()', () => {
      const fakeSocket = createFakeSocket();
      const client = createSignalingClient({ io: () => fakeSocket, url: 'https://example.test' });
      const handler = vi.fn();
      client.onError(handler);

      client.connect();
      const err = new Error('xhr poll error');
      fakeSocket.__trigger('connect_error', err);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(err);
    });

    it('подписка через onError() до connect() всё равно срабатывает после (пере)подключения', () => {
      const fakeSocket = createFakeSocket();
      const client = createSignalingClient({ io: () => fakeSocket, url: 'https://example.test' });
      const handler = vi.fn();

      client.onError(handler);
      client.connect();
      fakeSocket.__trigger('connect_error', new Error('timeout'));

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('несколько подписчиков onError() получают одно и то же событие', () => {
      const fakeSocket = createFakeSocket();
      const client = createSignalingClient({ io: () => fakeSocket, url: 'https://example.test' });
      const handlerA = vi.fn();
      const handlerB = vi.fn();
      client.onError(handlerA);
      client.onError(handlerB);
      client.connect();

      fakeSocket.__trigger('connect_error', new Error('boom'));

      expect(handlerA).toHaveBeenCalledTimes(1);
      expect(handlerB).toHaveBeenCalledTimes(1);
    });

    it('onError() возвращает функцию отписки — после неё колбэк больше не вызывается', () => {
      const fakeSocket = createFakeSocket();
      const client = createSignalingClient({ io: () => fakeSocket, url: 'https://example.test' });
      const handler = vi.fn();
      const unsubscribe = client.onError(handler);
      client.connect();

      unsubscribe();
      fakeSocket.__trigger('connect_error', new Error('boom'));

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('emit(): типобезопасность по контракту Design §6.1 (Client→Server)', () => {
    it.each(['join', 'chat:send', 'media:state', 'signal:offer', 'signal:answer', 'signal:ice', 'leave'])(
      'разрешённое событие "%s" передаётся в socket.emit как есть',
      (event) => {
        const fakeSocket = createFakeSocket();
        const client = createSignalingClient({ io: () => fakeSocket, url: 'https://example.test' });
        client.connect();
        const payload = { some: 'payload' };

        client.emit(event, payload);

        expect(fakeSocket.emit).toHaveBeenCalledWith(event, payload);
      },
    );

    it('неизвестное/чужого направления событие бросает TypeError и ничего не отправляет', () => {
      const fakeSocket = createFakeSocket();
      const client = createSignalingClient({ io: () => fakeSocket, url: 'https://example.test' });
      client.connect();

      expect(() => client.emit('join:ok', {})).toThrow(TypeError);
      expect(fakeSocket.emit).not.toHaveBeenCalled();
    });

    it('вызов до connect() бросает ошибку, не долетая до сокета', () => {
      const client = createSignalingClient({ io: () => createFakeSocket(), url: 'https://example.test' });

      expect(() => client.emit('join', { roomId: 'r', name: 'n' })).toThrow();
    });
  });

  describe('on(): типобезопасность по контракту Design §6.2 (Server→Client)', () => {
    it.each([
      'join:ok',
      'join:rejected',
      'participant:joined',
      'participant:left',
      'chat:message',
      'chat:system',
      'media:state',
      'signal:offer',
      'signal:answer',
      'signal:ice',
      'error',
    ])('разрешённое событие "%s" регистрируется на сокете', (event) => {
      const fakeSocket = createFakeSocket();
      const client = createSignalingClient({ io: () => fakeSocket, url: 'https://example.test' });
      client.connect();
      const cb = vi.fn();

      client.on(event, cb);

      expect(fakeSocket.on).toHaveBeenCalledWith(event, cb);
    });

    it('неизвестное/чужого направления событие бросает TypeError, не подписываясь на сокет', () => {
      const fakeSocket = createFakeSocket();
      const client = createSignalingClient({ io: () => fakeSocket, url: 'https://example.test' });
      client.connect();

      expect(() => client.on('chat:send', vi.fn())).toThrow(TypeError);
    });

    it('вызов до connect() бросает ошибку', () => {
      const client = createSignalingClient({ io: () => createFakeSocket(), url: 'https://example.test' });

      expect(() => client.on('join:ok', vi.fn())).toThrow();
    });
  });

  describe('disconnect()', () => {
    it('закрывает соединение и отписывает внутренний реэмиттер connect_error', () => {
      const fakeSocket = createFakeSocket();
      const client = createSignalingClient({ io: () => fakeSocket, url: 'https://example.test' });
      client.connect();

      client.disconnect();

      expect(fakeSocket.disconnect).toHaveBeenCalledTimes(1);
    });

    it('после disconnect() повторный connect() создаёт новый сокет (не переиспользует закрытый)', () => {
      const sockets = [createFakeSocket(), createFakeSocket()];
      let call = 0;
      const ioFactory = vi.fn(() => sockets[call++]);
      const client = createSignalingClient({ io: ioFactory, url: 'https://example.test' });

      const s1 = client.connect();
      client.disconnect();
      const s2 = client.connect();

      expect(s1).toBe(sockets[0]);
      expect(s2).toBe(sockets[1]);
      expect(ioFactory).toHaveBeenCalledTimes(2);
    });

    it('вызов без активного соединения — безопасный no-op', () => {
      const client = createSignalingClient({ io: () => createFakeSocket(), url: 'https://example.test' });

      expect(() => client.disconnect()).not.toThrow();
    });
  });
});
