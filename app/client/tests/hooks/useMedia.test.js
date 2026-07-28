import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMedia } from '../../src/hooks/useMedia.js';

/**
 * Задача 24 — `useMedia` (Design §3.3/§4.2/§7.2/§8, F-09/F-10/F-16/F-19,
 * US-6/7/12).
 *
 * Проверяет: (1) `init()` вызывает `controller.init()` и обновляет
 * `mediaState`/`localStream`; (2) `toggleAudio`/`toggleVideo` эмитят
 * `media:state` через переданный `emit` (обязанность вызывающего кода по
 * JSDoc `mediaController.js`); (3) `getVideoSenders` форвардится в фабрику
 * контроллера как `deps.getVideoSenders`.
 */
function makeFakeController(overrides = {}) {
  return {
    init: vi.fn().mockResolvedValue({ audio: true, video: true }),
    toggleAudio: vi.fn(() => ({ audio: false, video: true })),
    toggleVideo: vi.fn().mockResolvedValue({ audio: true, video: false }),
    getLocalStream: vi.fn(() => ({ id: 'stream-1' })),
    ...overrides,
  };
}

/**
 * Задача 30 (Design §8 «Отказ в доступе», баннер «нет доступа»): фейковый
 * `createMediaController`, который сохраняет переданный `deps.onDeviceDenied`
 * и позволяет тесту вызвать его напрямую — так же, как реальный
 * `mediaController.js` вызывает его из своего `catch` (см. его тесты).
 */
function makeFakeControllerFactory(overrides = {}) {
  let capturedDeps;
  const createMediaController = vi.fn((deps) => {
    capturedDeps = deps;
    return makeFakeController(overrides);
  });
  return { createMediaController, getCapturedDeps: () => capturedDeps };
}

describe('useMedia (Design §3.3/§4.2/§7.2/§8)', () => {
  it('форвардит getVideoSenders в фабрику createMediaController как deps.getVideoSenders', () => {
    const getVideoSenders = vi.fn(() => []);
    const fakeController = makeFakeController();
    const createMediaController = vi.fn(() => fakeController);

    renderHook(() => useMedia({ getVideoSenders, deps: { createMediaController } }));

    expect(createMediaController).toHaveBeenCalledWith(
      expect.objectContaining({ getVideoSenders }),
    );
  });

  it('init() обновляет mediaState и localStream из controller', async () => {
    const fakeController = makeFakeController();
    const createMediaController = vi.fn(() => fakeController);
    const { result } = renderHook(() => useMedia({ deps: { createMediaController } }));

    await act(async () => {
      await result.current.init();
    });

    expect(fakeController.init).toHaveBeenCalledTimes(1);
    expect(result.current.mediaState).toEqual({ audio: true, video: true });
    expect(result.current.localStream).toEqual({ id: 'stream-1' });
  });

  it('toggleAudio() обновляет mediaState и эмитит media:state', () => {
    const fakeController = makeFakeController();
    const createMediaController = vi.fn(() => fakeController);
    const emit = vi.fn();
    const { result } = renderHook(() => useMedia({ emit, deps: { createMediaController } }));

    act(() => {
      result.current.toggleAudio();
    });

    expect(fakeController.toggleAudio).toHaveBeenCalledTimes(1);
    expect(result.current.mediaState).toEqual({ audio: false, video: true });
    expect(emit).toHaveBeenCalledWith('media:state', { audio: false, video: true });
  });

  it('toggleVideo() обновляет mediaState/localStream и эмитит media:state', async () => {
    const fakeController = makeFakeController();
    const createMediaController = vi.fn(() => fakeController);
    const emit = vi.fn();
    const { result } = renderHook(() => useMedia({ emit, deps: { createMediaController } }));

    await act(async () => {
      await result.current.toggleVideo();
    });

    expect(fakeController.toggleVideo).toHaveBeenCalledTimes(1);
    expect(result.current.mediaState).toEqual({ audio: true, video: false });
    expect(emit).toHaveBeenCalledWith('media:state', { audio: true, video: false });
  });

  it('без emit (undefined) тумблеры не бросают', () => {
    const fakeController = makeFakeController();
    const createMediaController = vi.fn(() => fakeController);
    const { result } = renderHook(() => useMedia({ deps: { createMediaController } }));

    expect(() => act(() => result.current.toggleAudio())).not.toThrow();
  });

  describe('deviceDenied (задача 30, Design §8 «Отказ в доступе»)', () => {
    it('изначально false', () => {
      const { createMediaController } = makeFakeControllerFactory();
      const { result } = renderHook(() => useMedia({ deps: { createMediaController } }));

      expect(result.current.deviceDenied).toBe(false);
    });

    it('форвардит onDeviceDenied в фабрику контроллера как deps.onDeviceDenied', () => {
      const { createMediaController } = makeFakeControllerFactory();
      renderHook(() => useMedia({ deps: { createMediaController } }));

      expect(createMediaController).toHaveBeenCalledWith(
        expect.objectContaining({ onDeviceDenied: expect.any(Function) }),
      );
    });

    it('становится true, когда контроллер вызывает deps.onDeviceDenied()', () => {
      const { createMediaController, getCapturedDeps } = makeFakeControllerFactory();
      const { result } = renderHook(() => useMedia({ deps: { createMediaController } }));

      act(() => {
        getCapturedDeps().onDeviceDenied();
      });

      expect(result.current.deviceDenied).toBe(true);
    });
  });
});
