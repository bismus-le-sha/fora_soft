import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useSignaling } from '../../src/hooks/useSignaling.js';

/**
 * Задача 24 — `useSignaling` (Design §4.2/§6.1/§6.2/§7.1, F-07, US-6/9).
 *
 * Проверяет: (1) порядок `connect()` → `on()` → `emit('join', ...)`
 * соблюдается только когда `enabled: true`; (2) входящие Server→Client
 * события форвардятся в переданные `handlers`; (3) unmount вызывает
 * `disconnect()`.
 */
function makeFakeClient() {
  const listeners = {};
  const errorListeners = new Set();
  const api = {
    connect: vi.fn(),
    emit: vi.fn(),
    on: vi.fn((event, cb) => {
      (listeners[event] ??= []).push(cb);
    }),
    onError: vi.fn((cb) => {
      errorListeners.add(cb);
      return () => errorListeners.delete(cb);
    }),
    disconnect: vi.fn(),
  };
  return {
    api,
    trigger: (event, payload) => {
      for (const cb of listeners[event] ?? []) cb(payload);
    },
    triggerError: (reason) => {
      for (const cb of errorListeners) cb(reason);
    },
  };
}

describe('useSignaling (Design §4.2/§6.1/§6.2/§7.1)', () => {
  it('enabled=false: не подключается и не эмитит join', () => {
    const fake = makeFakeClient();
    renderHook(() =>
      useSignaling({
        roomId: 'r1',
        name: 'Алекс',
        enabled: false,
        deps: { createSignalingClient: () => fake.api },
      }),
    );

    expect(fake.api.connect).not.toHaveBeenCalled();
    expect(fake.api.emit).not.toHaveBeenCalled();
  });

  it('enabled=true: connect() → on(...) → emit("join", {roomId, name})', async () => {
    const fake = makeFakeClient();
    renderHook(() =>
      useSignaling({
        roomId: 'r1',
        name: 'Алекс',
        enabled: true,
        deps: { createSignalingClient: () => fake.api },
      }),
    );

    await waitFor(() => expect(fake.api.connect).toHaveBeenCalledTimes(1));
    expect(fake.api.on).toHaveBeenCalled();
    expect(fake.api.emit).toHaveBeenCalledWith('join', { roomId: 'r1', name: 'Алекс' });
  });

  it('форвардит join:ok в handlers.onJoinOk', async () => {
    const fake = makeFakeClient();
    const onJoinOk = vi.fn();
    renderHook(() =>
      useSignaling({
        roomId: 'r1',
        name: 'Алекс',
        enabled: true,
        handlers: { onJoinOk },
        deps: { createSignalingClient: () => fake.api },
      }),
    );
    await waitFor(() => expect(fake.api.connect).toHaveBeenCalledTimes(1));

    act(() => fake.trigger('join:ok', { selfId: 's1' }));

    expect(onJoinOk).toHaveBeenCalledWith({ selfId: 's1' });
  });

  it('форвардит connect_error (onError) в handlers.onConnectionError', async () => {
    const fake = makeFakeClient();
    const onConnectionError = vi.fn();
    renderHook(() =>
      useSignaling({
        roomId: 'r1',
        name: 'Алекс',
        enabled: true,
        handlers: { onConnectionError },
        deps: { createSignalingClient: () => fake.api },
      }),
    );
    await waitFor(() => expect(fake.api.connect).toHaveBeenCalledTimes(1));

    const reason = new Error('boom');
    act(() => fake.triggerError(reason));

    expect(onConnectionError).toHaveBeenCalledWith(reason);
  });

  it('unmount вызывает disconnect()', async () => {
    const fake = makeFakeClient();
    const { unmount } = renderHook(() =>
      useSignaling({
        roomId: 'r1',
        name: 'Алекс',
        enabled: true,
        deps: { createSignalingClient: () => fake.api },
      }),
    );
    await waitFor(() => expect(fake.api.connect).toHaveBeenCalledTimes(1));

    unmount();

    expect(fake.api.disconnect).toHaveBeenCalledTimes(1);
  });

  it('emit доступен сразу с первого рендера (ещё до connect())', () => {
    const fake = makeFakeClient();
    const { result } = renderHook(() =>
      useSignaling({
        roomId: 'r1',
        name: 'Алекс',
        enabled: false,
        deps: { createSignalingClient: () => fake.api },
      }),
    );

    expect(typeof result.current.emit).toBe('function');
  });
});
