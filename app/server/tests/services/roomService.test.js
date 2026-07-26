import { describe, it, expect } from 'vitest';
import { join, leave, postChat, setMedia, relaySignal } from '../../src/services/RoomService.js';
import { RoomRegistry } from '../../src/domain/RoomRegistry.js';

/**
 * Задача 8 (каркас): `RoomService` — заглушки, контракт (сигнатуры) зафиксирован
 * по Design §4.1; реализация бизнес-инвариантов — задачи 9–14. Эти тесты
 * фиксируют только то, что относится к задаче 8: методы существуют, вызываемы
 * и не бросают на структурно валидном входе (F-40 — единый инстанс не должен
 * падать). Поведенческие инварианты (join:ok/room-full/cleanup/анти-спуфинг/
 * история/media broadcast/relay) — вне скоупа, будут покрыты test-author в
 * задачах 9–14 и НЕ дублируются здесь.
 */
describe('services/RoomService — каркас (Design §4.1, задача 8)', () => {
  // `join` (задача 9) реально использует `socket.join(roomId)`/`socket.to(roomId)`/
  // `socket.data` и `ctx.config.ICE_SERVERS` — фейковый сокет/ctx дополнены
  // минимальными стабами, чтобы этот смоук-тест («вызываема, не бросает»)
  // остался в скоупе задачи 8 и не проверял бизнес-поведение (оно покрыто
  // `tests/socket/join.test.js`, задача 9).
  const fakeSocket = {
    id: 'socket-1',
    data: {},
    emit: () => {},
    join: () => {},
    to: () => ({ emit: () => {} }),
  };
  const ctx = { io: { emit: () => {} }, config: { ICE_SERVERS: [] }, registry: new RoomRegistry() };

  it.each([
    ['join', () => join(fakeSocket, { roomId: 'r1', name: 'A' }, ctx)],
    ['leave', () => leave(fakeSocket, ctx)],
    ['postChat', () => postChat(fakeSocket, { text: 'hi' }, ctx)],
    ['setMedia', () => setMedia(fakeSocket, { audio: true, video: false }, ctx)],
    ['relaySignal', () => relaySignal(fakeSocket, 'offer', { to: 'peer', sdp: 'v=0' }, ctx)],
  ])('%s — вызываемая функция, не бросает на структурно валидном входе', (_name, invoke) => {
    expect(invoke).not.toThrow();
  });

  it('все методы экспортированы как функции (контракт Design §4.1)', () => {
    expect(typeof join).toBe('function');
    expect(typeof leave).toBe('function');
    expect(typeof postChat).toBe('function');
    expect(typeof setMedia).toBe('function');
    expect(typeof relaySignal).toBe('function');
  });
});
