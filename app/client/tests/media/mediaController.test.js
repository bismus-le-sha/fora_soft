import { describe, it, expect, vi } from 'vitest';
import { createMediaController } from '../../src/media/mediaController.js';

/**
 * Задача 21 — mediaController.js (Design §3.3/§4.2/§7.2/§8, F-09/F-10/F-14/
 * F-19/F-33, US-6/US-7/US-12).
 *
 * Критерии приёмки (`impl-video-chat-room.md`, задача 21): «юнит-тест (моки
 * MediaStream) — выключение камеры вызывает `track.stop()` +
 * `replaceTrack(null)` на всех sender; отказ `getUserMedia` не роняет
 * приложение».
 *
 * `getUserMedia`/`getVideoSenders` инжектируются через `deps` — тот же
 * DI-приём, что `deps.getUserMedia` в `JoinGate.jsx` и `deps.io` в
 * `signalingClient.js` (никакой мутации глобального `navigator`).
 */

/** @returns {MediaStreamTrack} фейковая дорожка с моками `stop`/`enabled`. */
function fakeTrack(kind) {
  return { kind, enabled: true, readyState: 'live', stop: vi.fn() };
}

/** Минимальный фейковый MediaStream, достаточный для mediaController. */
function fakeStream(tracks) {
  const list = [...tracks];
  return {
    getTracks: () => [...list],
    getAudioTracks: () => list.filter((t) => t.kind === 'audio'),
    getVideoTracks: () => list.filter((t) => t.kind === 'video'),
    addTrack: vi.fn((t) => list.push(t)),
    removeTrack: vi.fn((t) => {
      const i = list.indexOf(t);
      if (i !== -1) list.splice(i, 1);
    }),
  };
}

/** Фейковый RTCRtpSender — единственный релевантный метод: `replaceTrack`. */
function fakeSender() {
  return { replaceTrack: vi.fn().mockResolvedValue(undefined) };
}

/**
 * Задача 31 — фейковый `MediaDevices`, достаточный для проверки
 * `devicechange`-подписки/отписки (`addEventListener`/`removeEventListener`),
 * с тестовым хелпером `_trigger()` для симуляции события.
 */
function fakeMediaDevices() {
  const handlers = new Set();
  return {
    addEventListener: vi.fn((event, cb) => {
      if (event === 'devicechange') handlers.add(cb);
    }),
    removeEventListener: vi.fn((event, cb) => {
      if (event === 'devicechange') handlers.delete(cb);
    }),
    _trigger() {
      for (const cb of handlers) cb();
    },
  };
}

describe('mediaController (Design §3.3/§4.2/§7.2/§8, F-09/F-10/F-19/F-33)', () => {
  describe('init()', () => {
    it('запрашивает audio+video по умолчанию и включает оба тумблера при успехе', async () => {
      const audio = fakeTrack('audio');
      const video = fakeTrack('video');
      const getUserMedia = vi.fn().mockResolvedValue(fakeStream([audio, video]));
      const controller = createMediaController({ getUserMedia });

      const state = await controller.init();

      expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: true });
      expect(state).toEqual({ audio: true, video: true });
      expect(controller.getLocalStream()).not.toBeNull();
    });

    it('отказ getUserMedia (reject) не бросает исключение — остаётся в комнате с off (Design §8)', async () => {
      const getUserMedia = vi.fn().mockRejectedValue(new Error('Permission denied'));
      const controller = createMediaController({ getUserMedia });

      await expect(controller.init()).resolves.toEqual({ audio: false, video: false });
      expect(controller.getLocalStream()).toBeNull();
    });

    it('нет физических устройств (getUserMedia reject NotFoundError) — тоже не роняет, оба off', async () => {
      const notFound = Object.assign(new Error('no devices'), { name: 'NotFoundError' });
      const getUserMedia = vi.fn().mockRejectedValue(notFound);
      const controller = createMediaController({ getUserMedia });

      const state = await controller.init();

      expect(state).toEqual({ audio: false, video: false });
    });

    it('повторный init не оставляет предыдущий захваченный поток работающим', async () => {
      const firstAudio = fakeTrack('audio');
      const firstVideo = fakeTrack('video');
      const secondAudio = fakeTrack('audio');
      const secondVideo = fakeTrack('video');
      const getUserMedia = vi
        .fn()
        .mockResolvedValueOnce(fakeStream([firstAudio, firstVideo]))
        .mockResolvedValueOnce(fakeStream([secondAudio, secondVideo]));
      const controller = createMediaController({ getUserMedia });

      await Promise.all([controller.init(), controller.init()]);

      expect(firstAudio.stop).toHaveBeenCalledTimes(1);
      expect(firstVideo.stop).toHaveBeenCalledTimes(1);
      expect(controller.getLocalStream().getTracks()).toEqual([secondAudio, secondVideo]);
    });

    it('если dispose вызван во время getUserMedia, поздно полученный поток сразу освобождается', async () => {
      const audio = fakeTrack('audio');
      const video = fakeTrack('video');
      let resolveStream;
      const getUserMedia = vi.fn(
        () =>
          new Promise((resolve) => {
            resolveStream = resolve;
          }),
      );
      const controller = createMediaController({ getUserMedia });

      const initPromise = controller.init();
      controller.dispose();
      resolveStream(fakeStream([audio, video]));
      await initPromise;

      expect(audio.stop).toHaveBeenCalledTimes(1);
      expect(video.stop).toHaveBeenCalledTimes(1);
      expect(controller.getLocalStream()).toBeNull();
    });
  });

  describe('toggleAudio()', () => {
    it('выключает микрофон через track.enabled=false, без обращения к sender-ам', async () => {
      const audio = fakeTrack('audio');
      const video = fakeTrack('video');
      const getUserMedia = vi.fn().mockResolvedValue(fakeStream([audio, video]));
      const getVideoSenders = vi.fn().mockReturnValue([fakeSender()]);
      const controller = createMediaController({ getUserMedia, getVideoSenders });
      await controller.init();

      const state = controller.toggleAudio();

      expect(audio.enabled).toBe(false);
      expect(state).toEqual({ audio: false, video: true });
      expect(getVideoSenders).not.toHaveBeenCalled();
    });

    it('повторный toggleAudio() снова включает микрофон', async () => {
      const audio = fakeTrack('audio');
      const getUserMedia = vi.fn().mockResolvedValue(fakeStream([audio]));
      const controller = createMediaController({ getUserMedia });
      await controller.init();

      controller.toggleAudio();
      const state = controller.toggleAudio();

      expect(audio.enabled).toBe(true);
      expect(state.audio).toBe(true);
    });

    it('без активной дорожки (устройство отсутствовало) — no-op, не бросает', async () => {
      const getUserMedia = vi.fn().mockRejectedValue(new Error('denied'));
      const controller = createMediaController({ getUserMedia });
      await controller.init();

      expect(() => controller.toggleAudio()).not.toThrow();
      expect(controller.toggleAudio()).toEqual({ audio: false, video: false });
    });
  });

  describe('toggleVideo() — выключение (Design §3.3 п.2/§7.2)', () => {
    it('вызывает track.stop() и replaceTrack(null) на КАЖДОМ известном sender', async () => {
      const audio = fakeTrack('audio');
      const video = fakeTrack('video');
      const senderA = fakeSender();
      const senderB = fakeSender();
      const getUserMedia = vi.fn().mockResolvedValue(fakeStream([audio, video]));
      const getVideoSenders = vi.fn().mockReturnValue([senderA, senderB]);
      const controller = createMediaController({ getUserMedia, getVideoSenders });
      await controller.init();

      const state = await controller.toggleVideo();

      expect(video.stop).toHaveBeenCalledTimes(1);
      expect(senderA.replaceTrack).toHaveBeenCalledWith(null);
      expect(senderB.replaceTrack).toHaveBeenCalledWith(null);
      expect(state).toEqual({ audio: true, video: false });
    });

    it('без известных sender (mesh ещё не создан) — всё равно останавливает дорожку, не бросает', async () => {
      const video = fakeTrack('video');
      const getUserMedia = vi.fn().mockResolvedValue(fakeStream([video]));
      const controller = createMediaController({ getUserMedia }); // deps.getVideoSenders не задан
      await controller.init();

      await expect(controller.toggleVideo()).resolves.toEqual({ audio: false, video: false });
      expect(video.stop).toHaveBeenCalledTimes(1);
    });

    it('release убирает дорожку из getLocalStream()', async () => {
      const video = fakeTrack('video');
      const getUserMedia = vi.fn().mockResolvedValue(fakeStream([video]));
      const controller = createMediaController({ getUserMedia });
      await controller.init();

      await controller.toggleVideo();

      expect(controller.getLocalStream().getVideoTracks()).toEqual([]);
    });
  });

  describe('toggleVideo() — включение (был off)', () => {
    it('повторный getUserMedia({video:true}) + replaceTrack(newTrack) на всех sender', async () => {
      const initialVideo = fakeTrack('video');
      const newVideo = fakeTrack('video');
      const senderA = fakeSender();
      const getUserMedia = vi
        .fn()
        .mockResolvedValueOnce(fakeStream([initialVideo]))
        .mockResolvedValueOnce(fakeStream([newVideo]));
      const getVideoSenders = vi.fn().mockReturnValue([senderA]);
      const controller = createMediaController({ getUserMedia, getVideoSenders });
      await controller.init();
      await controller.toggleVideo(); // off

      const state = await controller.toggleVideo(); // on again

      expect(getUserMedia).toHaveBeenLastCalledWith({ video: true });
      expect(senderA.replaceTrack).toHaveBeenLastCalledWith(newVideo);
      expect(state).toEqual({ audio: false, video: true });
    });

    it('отказ getUserMedia при включении не бросает — остаётся off (Design §8)', async () => {
      const video = fakeTrack('video');
      const getUserMedia = vi
        .fn()
        .mockResolvedValueOnce(fakeStream([video]))
        .mockRejectedValueOnce(new Error('Permission denied'));
      const controller = createMediaController({ getUserMedia });
      await controller.init();
      await controller.toggleVideo(); // off

      await expect(controller.toggleVideo()).resolves.toEqual({ audio: false, video: false });
    });

    it('выход во время повторного getUserMedia освобождает поздно полученную видеодорожку', async () => {
      const initialVideo = fakeTrack('video');
      const lateVideo = fakeTrack('video');
      let resolveVideo;
      const getUserMedia = vi
        .fn()
        .mockResolvedValueOnce(fakeStream([initialVideo]))
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveVideo = resolve;
            }),
        );
      const controller = createMediaController({ getUserMedia });
      await controller.init();
      await controller.toggleVideo();

      const enablePromise = controller.toggleVideo();
      controller.dispose();
      resolveVideo(fakeStream([lateVideo]));
      await enablePromise;

      expect(lateVideo.stop).toHaveBeenCalledTimes(1);
      expect(controller.getLocalStream()).toBeNull();
    });
  });

  describe('getLocalStream()', () => {
    it('возвращает null до init()', () => {
      const controller = createMediaController({ getUserMedia: vi.fn() });
      expect(controller.getLocalStream()).toBeNull();
    });
  });

  describe('dispose()', () => {
    it('останавливает все живые локальные треки и освобождает камеру/микрофон', async () => {
      const audio = fakeTrack('audio');
      const video = fakeTrack('video');
      const getUserMedia = vi.fn().mockResolvedValue(fakeStream([audio, video]));
      const controller = createMediaController({ getUserMedia });
      await controller.init();

      controller.dispose();

      expect(audio.stop).toHaveBeenCalledTimes(1);
      expect(video.stop).toHaveBeenCalledTimes(1);
      expect(controller.getLocalStream()).toBeNull();
    });
  });

  describe('deps.onDeviceDenied() — задача 30 (Design §8, баннер «нет доступа»)', () => {
    it('вызывается при отказе getUserMedia в init()', async () => {
      const getUserMedia = vi.fn().mockRejectedValue(new Error('Permission denied'));
      const onDeviceDenied = vi.fn();
      const controller = createMediaController({ getUserMedia, onDeviceDenied });

      await controller.init();

      expect(onDeviceDenied).toHaveBeenCalledTimes(1);
    });

    it('НЕ вызывается при успешном init()', async () => {
      const audio = fakeTrack('audio');
      const getUserMedia = vi.fn().mockResolvedValue(fakeStream([audio]));
      const onDeviceDenied = vi.fn();
      const controller = createMediaController({ getUserMedia, onDeviceDenied });

      await controller.init();

      expect(onDeviceDenied).not.toHaveBeenCalled();
    });

    it('вызывается при отказе getUserMedia в toggleVideo() (включение после off)', async () => {
      const getUserMedia = vi.fn().mockRejectedValue(new Error('Permission denied'));
      const onDeviceDenied = vi.fn();
      const controller = createMediaController({ getUserMedia, onDeviceDenied });
      await controller.init(); // тоже reject — уже 1 вызов
      onDeviceDenied.mockClear();

      await controller.toggleVideo(); // videoTrack отсутствует → ветка включения

      expect(onDeviceDenied).toHaveBeenCalledTimes(1);
    });

    it('без deps.onDeviceDenied — reject не бросает (необязательный колбэк)', async () => {
      const getUserMedia = vi.fn().mockRejectedValue(new Error('denied'));
      const controller = createMediaController({ getUserMedia });

      await expect(controller.init()).resolves.toEqual({ audio: false, video: false });
    });
  });

  describe('потеря устройства во время звонка — track.onended (задача 31, Design §8, F-20, US-7)', () => {
    it('video.onended переводит видео в off, останавливает sender без нового getUserMedia', async () => {
      const audio = fakeTrack('audio');
      const video = fakeTrack('video');
      const senderA = fakeSender();
      const getUserMedia = vi.fn().mockResolvedValue(fakeStream([audio, video]));
      const getVideoSenders = vi.fn().mockReturnValue([senderA]);
      const controller = createMediaController({ getUserMedia, getVideoSenders });
      await controller.init();
      getUserMedia.mockClear();

      video.onended();

      expect(controller.getLocalStream().getVideoTracks()).toEqual([]);
      expect(senderA.replaceTrack).toHaveBeenCalledWith(null);
      // Восстановление — НЕ автоматическое (F-20: пользователь выбирает устройство
      // в настройках ОС/браузера сам, повторный getUserMedia здесь не вызывается).
      expect(getUserMedia).not.toHaveBeenCalled();
    });

    it('audio.onended переводит микрофон в off', async () => {
      const audio = fakeTrack('audio');
      const getUserMedia = vi.fn().mockResolvedValue(fakeStream([audio]));
      const controller = createMediaController({ getUserMedia });
      await controller.init();

      audio.onended();

      expect(controller.getLocalStream().getAudioTracks()).toEqual([]);
      // toggleAudio() без активной дорожки — no-op (см. существующий тест выше),
      // возвращаемое состояние подтверждает audio:false.
      expect(controller.toggleAudio()).toEqual({ audio: false, video: false });
    });

    it('onStateChange(cb) уведомляется новым состоянием при потере видео', async () => {
      const video = fakeTrack('video');
      const getUserMedia = vi.fn().mockResolvedValue(fakeStream([video]));
      const controller = createMediaController({ getUserMedia });
      await controller.init();
      const handler = vi.fn();
      controller.onStateChange(handler);

      video.onended();

      expect(handler).toHaveBeenCalledWith({ audio: false, video: false });
    });

    it('устаревший track.onended (дорожка уже заменена ручным toggleVideo) — не переигрывает состояние', async () => {
      const initialVideo = fakeTrack('video');
      const newVideo = fakeTrack('video');
      const getUserMedia = vi
        .fn()
        .mockResolvedValueOnce(fakeStream([initialVideo]))
        .mockResolvedValueOnce(fakeStream([newVideo]));
      const controller = createMediaController({ getUserMedia });
      await controller.init();
      await controller.toggleVideo(); // off (ручной путь) — videoTrack теперь null
      await controller.toggleVideo(); // on again — videoTrack теперь newVideo
      const handler = vi.fn();
      controller.onStateChange(handler);

      // "Протухший" onended от УЖЕ отсоединённой первой дорожки.
      initialVideo.onended();

      expect(handler).not.toHaveBeenCalled();
      expect(controller.getLocalStream().getVideoTracks()).toEqual([newVideo]);
    });

    it('падение одного подписчика onStateChange не блокирует остальных', async () => {
      const video = fakeTrack('video');
      const getUserMedia = vi.fn().mockResolvedValue(fakeStream([video]));
      const controller = createMediaController({ getUserMedia });
      await controller.init();
      const broken = vi.fn(() => {
        throw new Error('boom');
      });
      const healthy = vi.fn();
      controller.onStateChange(broken);
      controller.onStateChange(healthy);

      expect(() => video.onended()).not.toThrow();
      expect(healthy).toHaveBeenCalledTimes(1);
    });

    it('отписка через возвращённую функцию прекращает доставку onStateChange', async () => {
      const video = fakeTrack('video');
      const getUserMedia = vi.fn().mockResolvedValue(fakeStream([video]));
      const controller = createMediaController({ getUserMedia });
      await controller.init();
      const handler = vi.fn();
      const unsubscribe = controller.onStateChange(handler);
      unsubscribe();

      video.onended();

      expect(handler).not.toHaveBeenCalled();
    });

    it('новая дорожка, полученная повторным toggleVideo() (on), тоже получает onended-обработчик', async () => {
      const initialVideo = fakeTrack('video');
      const newVideo = fakeTrack('video');
      const getUserMedia = vi
        .fn()
        .mockResolvedValueOnce(fakeStream([initialVideo]))
        .mockResolvedValueOnce(fakeStream([newVideo]));
      const controller = createMediaController({ getUserMedia });
      await controller.init();
      await controller.toggleVideo(); // off
      await controller.toggleVideo(); // on again -> newVideo
      const handler = vi.fn();
      controller.onStateChange(handler);

      newVideo.onended();

      expect(handler).toHaveBeenCalledWith({ audio: false, video: false });
    });
  });

  describe('devicechange — подстраховка (задача 31, Design §8, F-20)', () => {
    it('подписывается на mediaDevices.devicechange при создании контроллера', () => {
      const mediaDevices = fakeMediaDevices();
      createMediaController({ getUserMedia: vi.fn(), mediaDevices });

      expect(mediaDevices.addEventListener).toHaveBeenCalledWith('devicechange', expect.any(Function));
    });

    it('devicechange при readyState==="ended" у активной дорожки — переводит в off', async () => {
      const video = fakeTrack('video');
      const mediaDevices = fakeMediaDevices();
      const getUserMedia = vi.fn().mockResolvedValue(fakeStream([video]));
      const controller = createMediaController({ getUserMedia, mediaDevices });
      await controller.init();
      video.readyState = 'ended'; // симулируем: track.onended браузер не прислал

      mediaDevices._trigger();

      expect(controller.getLocalStream().getVideoTracks()).toEqual([]);
    });

    it('devicechange при живых дорожках (readyState !== "ended") ничего не меняет', async () => {
      const video = fakeTrack('video');
      const mediaDevices = fakeMediaDevices();
      const getUserMedia = vi.fn().mockResolvedValue(fakeStream([video]));
      const controller = createMediaController({ getUserMedia, mediaDevices });
      await controller.init();

      mediaDevices._trigger();

      expect(controller.getLocalStream().getVideoTracks()).toEqual([video]);
    });

    it('dispose() снимает devicechange-подписку', () => {
      const mediaDevices = fakeMediaDevices();
      const controller = createMediaController({ getUserMedia: vi.fn(), mediaDevices });

      controller.dispose();

      expect(mediaDevices.removeEventListener).toHaveBeenCalledWith('devicechange', expect.any(Function));
    });

    it('без deps.mediaDevices — не бросает (опциональная подстраховка)', () => {
      expect(() => createMediaController({ getUserMedia: vi.fn(), mediaDevices: undefined })).not.toThrow();
    });
  });
});
