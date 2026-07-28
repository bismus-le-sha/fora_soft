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
 * Задача 31 (Design §8 «Потеря устройства», F-20, US-7): фейковый контроллер
 * с управляемым `onStateChange` — тест может вызвать захваченный колбэк
 * напрямую, симулируя `mediaController`, обнаруживший потерю устройства
 * (`track.onended`/`devicechange`), без реального `MediaStreamTrack`.
 */
function makeFakeControllerWithStateChange(overrides = {}) {
  let capturedCb;
  const unsubscribe = vi.fn();
  const controller = makeFakeController({
    onStateChange: vi.fn((cb) => {
      capturedCb = cb;
      return unsubscribe;
    }),
    dispose: vi.fn(),
    ...overrides,
  });
  return { controller, unsubscribe, emitStateChange: (state) => capturedCb(state) };
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

  describe('потеря устройства во время звонка — controller.onStateChange (задача 31, Design §8, F-20, US-7)', () => {
    it('подписывается на controller.onStateChange при монтировании', () => {
      const { controller } = makeFakeControllerWithStateChange();
      const createMediaController = vi.fn(() => controller);

      renderHook(() => useMedia({ deps: { createMediaController } }));

      expect(controller.onStateChange).toHaveBeenCalledTimes(1);
    });

    it('когда контроллер сообщает о потере устройства — обновляет mediaState/localStream и эмитит media:state (тот же контракт, что ручные тумблеры)', () => {
      const { controller, emitStateChange } = makeFakeControllerWithStateChange();
      const createMediaController = vi.fn(() => controller);
      const emit = vi.fn();
      const { result } = renderHook(() => useMedia({ emit, deps: { createMediaController } }));

      act(() => {
        emitStateChange({ audio: true, video: false });
      });

      expect(result.current.mediaState).toEqual({ audio: true, video: false });
      expect(result.current.localStream).toEqual({ id: 'stream-1' });
      expect(emit).toHaveBeenCalledWith('media:state', { audio: true, video: false });
    });

    it('без emit — потеря устройства не бросает', () => {
      const { controller, emitStateChange } = makeFakeControllerWithStateChange();
      const createMediaController = vi.fn(() => controller);
      renderHook(() => useMedia({ deps: { createMediaController } }));

      expect(() => act(() => emitStateChange({ audio: false, video: false }))).not.toThrow();
    });

    it('размонтирование отписывается от onStateChange и вызывает controller.dispose()', () => {
      const { controller, unsubscribe } = makeFakeControllerWithStateChange();
      const createMediaController = vi.fn(() => controller);
      const { unmount } = renderHook(() => useMedia({ deps: { createMediaController } }));

      unmount();

      expect(unsubscribe).toHaveBeenCalledTimes(1);
      expect(controller.dispose).toHaveBeenCalledTimes(1);
    });

    it('без controller.onStateChange/dispose (старый контроллер) — не бросает', () => {
      const fakeController = makeFakeController();
      const createMediaController = vi.fn(() => fakeController);

      expect(() => {
        const { unmount } = renderHook(() => useMedia({ deps: { createMediaController } }));
        unmount();
      }).not.toThrow();
    });
  });
});
