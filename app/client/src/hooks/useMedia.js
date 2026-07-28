import { useCallback, useRef, useState } from 'react';
import { createMediaController } from '../media/mediaController.js';

/**
 * useMedia.js — React-хук-обёртка над `mediaController.js` (задача 24).
 *
 * Design §4.2: «`mediaController.js` | `getUserMedia`; toggle mic/cam».
 * Интегрирует `getVideoSenders` из `useMesh` (Design §3.3 п.2/§7.2 —
 * `toggleVideo()` реплейсит трек «на всех sender» действующих
 * `PeerConnection`) и берёт на себя обязанность, явно делегированную
 * `mediaController.js` вызывающей стороне (см. его JSDoc): «Эмиссию
 * `media:state` серверу mediaController не делает сам — это обязанность
 * вызывающего кода (`useMedia`/`RoomScreen`)» — здесь это происходит сразу
 * после каждого тумблера (Design §7.2 sequence: `toggleVideo()` →
 * `replaceTrack` → `media:state{...}` → сервер broadcast).
 *
 * Requirements: F-09, F-10, F-14, F-16, F-18, F-19, F-33, US-6, US-7, US-12.
 * Design: §3.3, §4.2, §7.2, §8.
 *
 * Задача 30 («Баннеры ошибок и состояний», Design §8 «Отказ в доступе» →
 * баннер «нет доступа», SEC-15): хук подписывается на
 * `mediaController.deps.onDeviceDenied` (см. JSDoc `mediaController.js`) и
 * отражает факт отказа в `deviceDenied` — `RoomScreen.jsx` рендерит по нему
 * `DeviceDeniedBanner`. Состояние держится здесь, а не в самом контроллере,
 * по тому же прецеденту, что и `mediaState`/`localStream` выше.
 */

/**
 * @param {object} [options]
 * @param {() => RTCRtpSender[]} [options.getVideoSenders] — форвардится в
 *   `createMediaController` как `deps.getVideoSenders`; в рантайме —
 *   `useMesh().getVideoSenders`.
 * @param {(event: string, payload?: object) => void} [options.emit] —
 *   `signalingClient.emit`-совместимая функция для `media:state` (Design
 *   §6.1); необязательна (например, до готовности сигналинга) — тогда
 *   тумблеры просто не эмитят наружу.
 * @param {object} [options.deps]
 * @param {(deps?: object) => ReturnType<typeof createMediaController>} [options.deps.createMediaController]
 *   — фабрика контроллера, по умолчанию реальный `createMediaController`;
 *   параметр только для тестируемости.
 * @param {(constraints: MediaStreamConstraints) => Promise<MediaStream>} [options.deps.getUserMedia]
 *   — форвардится как `deps.getUserMedia` (тестируемость, тот же приём, что
 *   `JoinGate.jsx`).
 * @returns {{
 *   init: () => Promise<{audio: boolean, video: boolean}>,
 *   toggleAudio: () => {audio: boolean, video: boolean},
 *   toggleVideo: () => Promise<{audio: boolean, video: boolean}>,
 *   getLocalStream: () => MediaStream | null,
 *   localStream: MediaStream | null,
 *   mediaState: {audio: boolean, video: boolean},
 *   deviceDenied: boolean,
 * }}
 */
export function useMedia({ getVideoSenders, emit, deps } = {}) {
  const [deviceDenied, setDeviceDenied] = useState(false);

  const controllerRef = useRef(null);
  if (!controllerRef.current) {
    const createController = deps?.createMediaController ?? createMediaController;
    controllerRef.current = createController({
      getUserMedia: deps?.getUserMedia,
      getVideoSenders,
      onDeviceDenied: () => setDeviceDenied(true),
    });
  }

  const [mediaState, setMediaState] = useState({ audio: false, video: false });
  const [localStream, setLocalStream] = useState(null);

  const init = useCallback(async () => {
    const state = await controllerRef.current.init();
    setMediaState(state);
    setLocalStream(controllerRef.current.getLocalStream());
    return state;
  }, []);

  const toggleAudio = useCallback(() => {
    const state = controllerRef.current.toggleAudio();
    setMediaState(state);
    emit?.('media:state', state);
    return state;
  }, [emit]);

  const toggleVideo = useCallback(async () => {
    const state = await controllerRef.current.toggleVideo();
    setMediaState(state);
    setLocalStream(controllerRef.current.getLocalStream());
    emit?.('media:state', state);
    return state;
  }, [emit]);

  const getLocalStream = useCallback(() => controllerRef.current.getLocalStream(), []);

  return { init, toggleAudio, toggleVideo, getLocalStream, localStream, mediaState, deviceDenied };
}
