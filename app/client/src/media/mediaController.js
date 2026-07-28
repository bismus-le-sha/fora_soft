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
 * - «Потеря устройства во время звонка» (`track.onended`/`devicechange`,
 *   F-20, US-7) — реализовано задачей 31 (см. блок ниже, «Задача 31»), было
 *   осознанно вне скоупа задачи 21.
 *
 * Задача 31 («Крайние случаи медиа: autoplay, потеря устройства, graceful
 * P2P», Design §8 «Потеря устройства во время звонка», F-20, US-7):
 * — `audioTrack`/`videoTrack` получают обработчик `track.onended` сразу
 *   после получения (в `init()` и в ветке включения `toggleVideo()`) —
 *   срабатывает, когда ОС/браузер обрывает дорожку не по нашей команде
 *   (устройство отключили физически/забрал другой апп/отозвали разрешение).
 *   Обработчик переводит состояние в off (симметрично ручному выключению,
 *   но БЕЗ повторного `getUserMedia`, т.к. устройства уже нет) и уведомляет
 *   подписчиков `onStateChange(cb)` — тем же способом, каким `useMedia.js`
 *   уже слушает `onDeviceDenied` (см. ниже), только для уже идущего звонка,
 *   а не для первичного/повторного запроса.
 * — Дополнительно слушается системное `mediaDevices.devicechange` (список
 *   устройств ОС изменился) как подстраховка: если к этому моменту активная
 *   дорожка уже в `readyState === 'ended'`, а `track.onended` почему-то не
 *   сработал (не все браузеры одинаково надёжны), состояние досчитывается
 *   тем же путём. Слушатель регистрируется один раз на весь жизненный цикл
 *   контроллера; `dispose()` его снимает (вызывается вызывающей стороной при
 *   размонтировании — `useMedia.js`).
 * — Эмиссию `media:state` серверу (Design §6.1) по-прежнему делает вызывающая
 *   сторона (`useMedia.js`), не этот модуль — здесь только домен и нотификация
 *   через `onStateChange`, тот же принцип разделения ответственности, что и
 *   у ручных тумблеров (см. выше).
 *
 * Requirements: F-09, F-10, F-14, F-19, F-20, F-33, US-6, US-7, US-12.
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
 *
 * Задача 30 («Баннеры ошибок и состояний», Design §8 «Отказ в доступе к
 * камере/микрофону» → баннер «нет доступа», F-33/US-12/SEC-15): опциональный
 * `deps.onDeviceDenied()` — callback, вызываемый КАЖДЫЙ раз, когда
 * `getUserMedia` реджектится (в `init()` и при включении видео в
 * `toggleVideo()`). Не меняет форму резолвящегося состояния
 * `{audio, video}` (существующие тесты `mediaController.test.js` полагаются
 * на `toEqual` со строгой формой) — сигнал «отказ устройства» идёт отдельным
 * каналом, а не полем возвращаемого объекта. Вызывающая сторона
 * (`useMedia.js`) решает, как отразить это в UI (баннер).
 */

/**
 * @param {MediaStreamConstraints} constraints
 * @returns {Promise<MediaStream>}
 */
function defaultGetUserMedia(constraints) {
  return globalThis.navigator.mediaDevices.getUserMedia(constraints);
}

/**
 * Дефолт для `deps.mediaDevices` (задача 31, `devicechange`-подстраховка) —
 * реальный `navigator.mediaDevices`; может отсутствовать (SSR/старый
 * браузер/тестовое окружение), поэтому вызывающий код обращается к нему
 * только через опциональную цепочку (`?.`).
 *
 * @returns {MediaDevices | undefined}
 */
function defaultMediaDevices() {
  return globalThis.navigator?.mediaDevices;
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
 * @param {() => void} [deps.onDeviceDenied] — задача 30: вызывается при
 *   каждом отказе `getUserMedia` (см. JSDoc модуля выше); необязателен —
 *   без него контроллер ведёт себя как раньше (задача 21).
 * @param {MediaDevices | undefined} [deps.mediaDevices] — задача 31: источник
 *   `devicechange`, только для тестируемости; по умолчанию реальный
 *   `navigator.mediaDevices`.
 * @returns {{
 *   init: () => Promise<{audio: boolean, video: boolean}>,
 *   toggleAudio: () => {audio: boolean, video: boolean},
 *   toggleVideo: () => Promise<{audio: boolean, video: boolean}>,
 *   getLocalStream: () => MediaStream | null,
 *   onStateChange: (cb: (state: {audio: boolean, video: boolean}) => void) => () => void,
 *   dispose: () => void,
 * }}
 */
export function createMediaController(deps = {}) {
  const getUserMedia = deps.getUserMedia ?? defaultGetUserMedia;
  const getVideoSenders = deps.getVideoSenders ?? defaultGetVideoSenders;
  const onDeviceDenied = deps.onDeviceDenied;
  const mediaDevices = deps.mediaDevices ?? defaultMediaDevices();

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
   * Задача 31 (Design §8 «Потеря устройства во время звонка», F-20, US-7):
   * подписчики на изменения состояния, НЕ вызванные вызывающей стороной
   * напрямую (т.е. не через возврат `toggleAudio`/`toggleVideo`/`init`), а
   * произошедшие асинхронно из-за потери устройства. Тот же приём
   * изоляции подписчиков try/catch, что `notifyRemoteStream` в
   * `MeshManager.js`/обработчики в `PeerConnection.js`.
   *
   * @type {Set<(state: {audio: boolean, video: boolean}) => void>}
   */
  const stateChangeHandlers = new Set();

  function notifyStateChange() {
    const state = getMediaState();
    for (const handler of stateChangeHandlers) {
      try {
        handler(state);
      } catch {
        // см. комментарий выше — падение одного подписчика не должно
        // блокировать доставку остальным.
      }
    }
  }

  /**
   * @param {(state: {audio: boolean, video: boolean}) => void} cb
   * @returns {() => void} функция отписки.
   */
  function onStateChange(cb) {
    stateChangeHandlers.add(cb);
    return () => stateChangeHandlers.delete(cb);
  }

  /**
   * Design §8 «Потеря устройства…видеодорожка прекращается»: симметрично
   * ручному выключению камеры (`toggleVideo()`, был on), НО без повторного
   * `getUserMedia` при восстановлении — устройства больше нет физически,
   * пользователь восстанавливает его через настройки ОС/браузера (F-20).
   * Идемпотентно относительно повторного/устаревшего вызова — если
   * `videoTrack` уже не эта дорожка (ручной toggle уже сработал раньше),
   * ничего не делает (см. `attachTrackLossHandler`).
   */
  function handleVideoTrackLost() {
    const lostTrack = videoTrack;
    if (!lostTrack) {
      return;
    }
    videoTrack = null;
    if (localStream) {
      localStream.removeTrack(lostTrack);
    }
    for (const sender of getVideoSenders()) {
      sender.replaceTrack(null).catch(() => {
        // Design §8/SEC-17: сбой конкретного sender'а (например, у пира с
        // уже нежизнеспособным соединением) не должен ронять обработку
        // потери устройства для остальных.
      });
    }
    notifyStateChange();
  }

  /** Аналогично `handleVideoTrackLost`, но для аудио (F-20). */
  function handleAudioTrackLost() {
    const lostTrack = audioTrack;
    if (!lostTrack) {
      return;
    }
    audioTrack = null;
    if (localStream) {
      localStream.removeTrack(lostTrack);
    }
    notifyStateChange();
  }

  /**
   * Вешает `track.onended` на только что полученную дорожку. Замыкает
   * конкретный объект `track`, поэтому если к моменту события дорожка уже
   * заменена/остановлена вручную (`audioTrack`/`videoTrack` больше не ===
   * этот `track`), обработчик — no-op (ручной путь уже обновил состояние
   * сам, повторная обработка не нужна и не должна произойти).
   *
   * @param {MediaStreamTrack} track
   * @param {'audio' | 'video'} kind
   */
  function attachTrackLossHandler(track, kind) {
    track.onended = () => {
      if (kind === 'video' && videoTrack === track) {
        handleVideoTrackLost();
      } else if (kind === 'audio' && audioTrack === track) {
        handleAudioTrackLost();
      }
    };
  }

  /**
   * Design §8 «devicechange» — подстраховка на случай, если конкретный
   * браузер не прислал `track.onended` для уже завершившейся дорожки:
   * системное событие изменения списка устройств — повод перепроверить
   * `readyState` активных дорожек и досчитать потерю, если она уже
   * произошла. Не делает ничего нового, если обе дорожки уже актуальны.
   */
  function handleDeviceChange() {
    if (videoTrack && videoTrack.readyState === 'ended') {
      handleVideoTrackLost();
    }
    if (audioTrack && audioTrack.readyState === 'ended') {
      handleAudioTrackLost();
    }
  }

  mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);

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
      if (audioTrack) {
        attachTrackLossHandler(audioTrack, 'audio');
      }
      if (videoTrack) {
        attachTrackLossHandler(videoTrack, 'video');
      }
    } catch {
      // Design §8: остаться в комнате с выключенными устройствами, не бросать.
      localStream = null;
      audioTrack = null;
      videoTrack = null;
      onDeviceDenied?.();
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
      attachTrackLossHandler(newTrack, 'video');
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
      onDeviceDenied?.();
    }
    return getMediaState();
  }

  /** @returns {MediaStream | null} */
  function getLocalStream() {
    return localStream;
  }

  /**
   * Задача 31: снимает `devicechange`-подписку (Design §8) — вызывается
   * вызывающей стороной (`useMedia.js`) при размонтировании/выходе из
   * комнаты, симметрично `MeshManager.closeAll()`.
   */
  function dispose() {
    mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
  }

  return { init, toggleAudio, toggleVideo, getLocalStream, onStateChange, dispose };
}
