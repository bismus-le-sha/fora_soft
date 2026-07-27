/**
 * mediaController.js — владение локальным медиа-потоком (getUserMedia) и
 * тумблеры mic/cam (задача 21).
 *
 * Design §4.2 (таблица компонентов): «`mediaController.js` | `getUserMedia`;
 * toggle mic (`track.enabled`); toggle cam (`stop()`+`replaceTrack`);
 * обработка отказа/отсутствия устройств (US-12, F-14). | `init()`,
 * `toggleAudio()`, `toggleVideo()`, `getLocalStream()`».
 *
 * Design §3.3 п.2 «Камера off = release устройства без renegotiation»:
 * `track.stop()` (гасит аппаратный индикатор, F-19) + `sender.replaceTrack(null)`
 * на всех `PeerConnection`. m-line сохраняется → renegotiation не нужен.
 *
 * Design §7.2 (sequence «Выключение камеры»): `toggleVideo()` (был on) →
 * `videoTrack.stop()` → цикл по каждому sender → `videoSender.replaceTrack(null)`
 * (без renegotiation). Включение: `getUserMedia({video})` →
 * `replaceTrack(newTrack)`. Эмиссию `media:state` серверу делает вызывающий
 * код (`useMedia.js`, задача 24+) — не этот модуль; здесь только управление
 * треками/sender'ами и возврат текущего состояния тумблеров вызывающей
 * стороне.
 *
 * Design §8 (Error Handling & Edge Cases):
 * - «Отказ в доступе к камере/микрофону» → `getUserMedia` reject → участник
 *   остаётся в комнате с выключенными устройствами, НЕ «вылетает» (F-33,
 *   US-12, SEC-21). Здесь: `init()`/`toggleVideo()` перехватывают reject,
 *   ничего не бросают наружу, состояние остаётся off.
 * - «Нет физических устройств» → присоединяется; отсутствующее устройство —
 *   off. Один `getUserMedia({audio,video})` в `init()` — при отсутствии
 *   одного из устройств браузер обычно отклоняет весь вызов; это покрывается
 *   тем же catch-путём (полностью off), раздельные audio/video-запросы для
 *   частичного успеха — вне зафиксированного скоупа задачи 21.
 * - «Потеря устройства во время звонка» (`track.onended`/`devicechange`) —
 *   осознанно вне скоупа задачи 21 (план явно ограничивает её `init/
 *   toggleAudio/toggleVideo`); не реализовано, TODO для будущей задачи.
 *
 * Requirements: F-09, F-10, F-14, F-19, F-33, US-6, US-7, US-12.
 *
 * MeshManager/PeerConnection (задачи 22/23) ещё не существуют на момент этой
 * задачи, поэтому список текущих video-sender'ов — не жёсткая зависимость от
 * ещё не написанного модуля, а инъекция через `deps.getVideoSenders()` (тот
 * же DI-приём, что `deps.getUserMedia` в `JoinGate.jsx`/`deps.io` в
 * `signalingClient.js`/`target` в `lib/compat.js`). Задача 23 подключит сюда
 * реальный `MeshManager.getVideoSenders()`.
 *
 * Тумблер микрофона (F-09) не трогает sender'ы вовсе: `track.enabled = false`
 * достаточно — WebRTC продолжает слать ту же дорожку (просто «тишину»),
 * m-line/renegotiation не затрагиваются, поэтому `toggleAudio()` не требует
 * DI-доступа к sender'ам.
 */

/**
 * @param {MediaStreamConstraints} constraints
 * @returns {Promise<MediaStream>}
 */
function defaultGetUserMedia(constraints) {
  return globalThis.navigator.mediaDevices.getUserMedia(constraints);
}

/**
 * Дефолт для `deps.getVideoSenders` — до подключения `MeshManager` (задача
 * 23) sender'ов ещё нет ни у кого, поэтому пустой список — безопасный
 * дефолт (toggleVideo() всё равно останавливает/запускает локальную
 * дорожку, просто без пиров, кому реплейсить).
 *
 * @returns {RTCRtpSender[]}
 */
function defaultGetVideoSenders() {
  return [];
}

/**
 * Создаёт изолированный экземпляр контроллера медиа. Фабрика (не singleton)
 * — по тому же прецеденту, что `createSignalingClient` (задача 18): каждый
 * вход в комнату получает собственное замкнутое состояние.
 *
 * @param {object} [deps]
 * @param {(constraints: MediaStreamConstraints) => Promise<MediaStream>} [deps.getUserMedia]
 *   — фабрика запроса устройств, только для тестируемости; по умолчанию
 *   реальный `navigator.mediaDevices.getUserMedia`.
 * @param {() => RTCRtpSender[]} [deps.getVideoSenders]
 *   — источник текущих video-sender'ов всех активных `PeerConnection`
 *   (Design §3.3 п.2/§7.2 «на всех PeerConnection»/«на всех sender»); в
 *   рантайме — `MeshManager.getVideoSenders()` (задача 23), здесь — только
 *   инъекция для тестируемости и развязки от ещё не написанного модуля.
 * @returns {{
 *   init: () => Promise<{audio: boolean, video: boolean}>,
 *   toggleAudio: () => {audio: boolean, video: boolean},
 *   toggleVideo: () => Promise<{audio: boolean, video: boolean}>,
 *   getLocalStream: () => MediaStream | null,
 * }}
 */
export function createMediaController(deps = {}) {
  const getUserMedia = deps.getUserMedia ?? defaultGetUserMedia;
  const getVideoSenders = deps.getVideoSenders ?? defaultGetVideoSenders;

  /** @type {MediaStream | null} */
  let localStream = null;
  /** @type {MediaStreamTrack | null} */
  let audioTrack = null;
  /** @type {MediaStreamTrack | null} */
  let videoTrack = null;

  /** @returns {{audio: boolean, video: boolean}} */
  function getMediaState() {
    return {
      audio: !!audioTrack && audioTrack.enabled,
      video: !!videoTrack,
    };
  }

  /**
   * Первичный запрос устройств — audio+video по умолчанию (PRD «При входе в
   * комнату микрофон и камера должны быть включены по умолчанию»).
   *
   * Design §8 «Отказ в доступе»/«Нет физических устройств»: reject
   * перехватывается целиком — контроллер остаётся в состоянии «оба off»,
   * ничего не бросает наружу (вызывающий код/комната не падает).
   *
   * @returns {Promise<{audio: boolean, video: boolean}>}
   */
  async function init() {
    try {
      const stream = await getUserMedia({ audio: true, video: true });
      localStream = stream;
      audioTrack = stream.getAudioTracks()[0] ?? null;
      videoTrack = stream.getVideoTracks()[0] ?? null;
    } catch {
      // Design §8: остаться в комнате с выключенными устройствами, не бросать.
      localStream = null;
      audioTrack = null;
      videoTrack = null;
    }
    return getMediaState();
  }

  /**
   * Design §4.2/PRD F-09: тумблер микрофона — только `track.enabled`, без
   * renegotiation и без обращения к sender'ам (см. JSDoc модуля). Нет
   * активной дорожки (устройство отсутствовало/отказано) — no-op.
   *
   * @returns {{audio: boolean, video: boolean}}
   */
  function toggleAudio() {
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
    }
    return getMediaState();
  }

  /**
   * Design §3.3 п.2/§7.2: был on → `track.stop()` (гасит аппаратный
   * индикатор, F-19) + `replaceTrack(null)` на всех известных video-sender'ах
   * (m-line сохраняется, renegotiation не требуется). Был off → повторный
   * `getUserMedia({video:true})` и `replaceTrack(newTrack)` на тех же
   * sender'ах; отказ здесь тоже перехватывается — остаётся off, не бросает
   * наружу (Design §8).
   *
   * @returns {Promise<{audio: boolean, video: boolean}>}
   */
  async function toggleVideo() {
    if (videoTrack) {
      const stoppedTrack = videoTrack;
      videoTrack = null;
      stoppedTrack.stop();
      if (localStream) {
        localStream.removeTrack(stoppedTrack);
      }
      for (const sender of getVideoSenders()) {
        await sender.replaceTrack(null);
      }
      return getMediaState();
    }

    try {
      const stream = await getUserMedia({ video: true });
      const newTrack = stream.getVideoTracks()[0] ?? null;
      if (!newTrack) {
        return getMediaState();
      }
      videoTrack = newTrack;
      if (localStream) {
        localStream.addTrack(newTrack);
      } else {
        localStream = stream;
      }
      for (const sender of getVideoSenders()) {
        await sender.replaceTrack(newTrack);
      }
    } catch {
      // Design §8 «Отказ в доступе»: остаться off, не бросать наружу.
    }
    return getMediaState();
  }

  /** @returns {MediaStream | null} */
  function getLocalStream() {
    return localStream;
  }

  return { init, toggleAudio, toggleVideo, getLocalStream };
}
