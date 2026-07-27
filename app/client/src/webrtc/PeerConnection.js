/**
 * PeerConnection.js — тонкая обёртка одного `RTCPeerConnection` (задача 22).
 *
 * Design §4.2 (таблица компонентов): «Обёртка одного `RTCPeerConnection`:
 * создание offer/answer, ICE, `ontrack`, `replaceTrack`, close.» Интерфейс:
 * `createOffer()`, `acceptOffer(sdp)`, `acceptAnswer(sdp)`, `addIce(c)`,
 * `close()` (+ `ontrack`/`replaceTrack`, упомянутые в описании ответственности
 * и в плане задачи 22, но не входящие в сокращённый конспект интерфейса).
 *
 * Design §6.1/§6.2 (сетевой контракт): `signal:offer`/`signal:answer` носят
 * SDP как **строку** (`{ to, sdp: string }`), `signal:ice` — ICE-кандидат как
 * **объект** (`{ to, candidate: object }`). Этот модуль принимает/возвращает
 * ровно эти же формы без какого-либо промежуточного представления — только
 * прямая передача в нативный `RTCPeerConnection`.
 *
 * Design §7.1 (glare-free mesh): «старожил» вызывает `createOffer()` первым
 * (без ожидания входящего offer), «новичок» — только `acceptOffer(sdp)` в
 * ответ. Само правило «кто offerer» реализует `MeshManager` (задача 23) —
 * этот модуль не знает о ролях, он лишь механически создаёт offer/answer по
 * запросу вызывающей стороны.
 *
 * SEC-18 (covered, Design §8/§10): «Некорректный/вредоносный SDP/ICE от
 * пира» — `setRemoteDescription`/`addIceCandidate` обёрнуты в try/catch,
 * ошибка парсинга/применения НЕ выбрасывается наружу и не роняет клиент;
 * вызывающая сторона получает `false`/`null` вместо результата и может
 * решить, что делать дальше (например, залогировать/проигнорировать).
 * Модуль **не содержит собственного парсинга SDP** — вся интерпретация SDP-
 * строки и ICE-кандидата делегирована браузерному `RTCPeerConnection`;
 * данные передаются как есть (opaque string / opaque object), без regex,
 * шаблонизации или разбора полей.
 *
 * Requirements: F-06, US-6, SEC-18.
 */
import { ICE_SERVERS } from '../config.js';

/**
 * @param {typeof globalThis} target
 * @returns {typeof RTCPeerConnection}
 */
function defaultRTCPeerConnection(target) {
  return (target ?? globalThis).RTCPeerConnection;
}

/**
 * Создаёт изолированную обёртку одного `RTCPeerConnection`. Фабрика (не
 * singleton) — тот же приём DI, что `createSignalingClient`/
 * `createMediaController` (задачи 18/21): каждая пара участников в mesh
 * получает собственный экземпляр с собственным замкнутым состоянием.
 *
 * @param {object} [deps]
 * @param {typeof RTCPeerConnection} [deps.RTCPeerConnection] — конструктор,
 *   по умолчанию глобальный `RTCPeerConnection`; параметр только для
 *   тестируемости (тот же приём, что `deps.getUserMedia`/`deps.io` в
 *   `mediaController.js`/`signalingClient.js`), без мутации `globalThis`.
 * @param {RTCIceServer[]} [deps.iceServers] — по умолчанию
 *   `config.ICE_SERVERS` (статический fallback, SEC-17); в рантайме
 *   `MeshManager` (задача 23) обязан передавать актуальный список из
 *   `join:ok.iceServers`, если сервер его прислал.
 * @returns {{
 *   createOffer: () => Promise<string>,
 *   acceptOffer: (sdp: string) => Promise<string | null>,
 *   acceptAnswer: (sdp: string) => Promise<boolean>,
 *   addIce: (candidate: object) => Promise<boolean>,
 *   addTrack: (track: MediaStreamTrack, stream?: MediaStream) => RTCRtpSender,
 *   replaceTrack: (track: MediaStreamTrack | null) => Promise<void>,
 *   onTrack: (cb: (event: RTCTrackEvent) => void) => () => void,
 *   onIceCandidate: (cb: (candidate: RTCIceCandidate) => void) => () => void,
 *   close: () => void,
 * }}
 */
export function createPeerConnection(deps = {}) {
  const RTCPeerConnectionCtor = deps.RTCPeerConnection ?? defaultRTCPeerConnection();
  const iceServers = deps.iceServers ?? ICE_SERVERS;

  const pc = new RTCPeerConnectionCtor({ iceServers });

  /** @type {Set<(event: RTCTrackEvent) => void>} */
  const trackHandlers = new Set();
  /** @type {Set<(candidate: RTCIceCandidate) => void>} */
  const iceCandidateHandlers = new Set();
  /**
   * Sender видео-дорожки этого соединения — единственный per Design §3.3 п.2
   * («на всех PeerConnection» подразумевает по одному видео-sender на
   * соединение). Запоминается при первом `addTrack`/`replaceTrack` с видео-
   * дорожкой, т.к. после `replaceTrack(null)` у sender'а `track === null` и
   * найти его повторным поиском по `kind` уже нельзя.
   *
   * @type {RTCRtpSender | null}
   */
  let videoSender = null;

  // Design §7.1 «агрегирует remote-streams» (MeshManager) — этот модуль лишь
  // ретранслирует нативное событие всем подписчикам, каждый в своём try/catch
  // (падение одного обработчика не должно глушить остальных — прецедент
  // `notifyError` в signalingClient.js).
  pc.ontrack = (event) => {
    for (const handler of trackHandlers) {
      try {
        handler(event);
      } catch {
        // см. комментарий выше.
      }
    }
  };

  // Design §7.1 «par ICE trickle (обе стороны)»: локально сгенерированные
  // кандидаты должны попасть в `signal:ice{to,candidate}` — этот модуль сам
  // не знает адресата (это знает MeshManager), поэтому только ретранслирует
  // событие подписчикам. `event.candidate === null` — штатный маркер конца
  // сбора кандидатов (end-of-candidates), не кандидат, наружу не передаём.
  pc.onicecandidate = (event) => {
    if (!event.candidate) {
      return;
    }
    for (const handler of iceCandidateHandlers) {
      try {
        handler(event.candidate);
      } catch {
        // см. комментарий выше.
      }
    }
  };

  /**
   * Design §7.1: вызывается «старожилом» — единственным инициатором на пару
   * (glare-free). Своего парсинга/модификации SDP нет: то, что вернул
   * `pc.localDescription.sdp` после `createOffer`+`setLocalDescription`,
   * идёт наружу как есть (opaque string, `signal:offer{sdp}`).
   *
   * @returns {Promise<string>} SDP предложения.
   */
  async function createOffer() {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    return pc.localDescription.sdp;
  }

  /**
   * Design §7.1: вызывается «новичком» на входящий `signal:offer{sdp}`.
   * SEC-18: `setRemoteDescription` в try/catch — некорректный/вредоносный
   * SDP не роняет клиент, метод возвращает `null` вместо ответа.
   *
   * @param {string} sdp
   * @returns {Promise<string | null>} SDP ответа либо `null` при ошибке применения offer.
   */
  async function acceptOffer(sdp) {
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp });
    } catch {
      return null;
    }
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    return pc.localDescription.sdp;
  }

  /**
   * Design §7.1: вызывается «старожилом» на входящий `signal:answer{sdp}`.
   * SEC-18: `setRemoteDescription` в try/catch — ошибка не выбрасывается.
   *
   * @param {string} sdp
   * @returns {Promise<boolean>} `true`, если answer применён успешно.
   */
  async function acceptAnswer(sdp) {
    try {
      await pc.setRemoteDescription({ type: 'answer', sdp });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Design §7.1/§6.1 (`signal:ice{candidate: object}`). SEC-18:
   * `addIceCandidate` в try/catch — некорректный/вредоносный ICE-кандидат не
   * роняет клиент. Кандидат передаётся в нативный API как есть, без
   * собственного разбора полей.
   *
   * @param {object} candidate
   * @returns {Promise<boolean>} `true`, если кандидат применён успешно.
   */
  async function addIce(candidate) {
    try {
      await pc.addIceCandidate(candidate);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Прикрепляет локальную дорожку к соединению (до `createOffer()`/до
   * `acceptOffer()` — m-line должен существовать на обеих сторонах). Видео-
   * дорожка запоминается как `videoSender` для последующих `replaceTrack`
   * без renegotiation (Design §3.3 п.2).
   *
   * @param {MediaStreamTrack} track
   * @param {MediaStream} [stream]
   * @returns {RTCRtpSender}
   */
  function addTrack(track, stream) {
    const sender = stream ? pc.addTrack(track, stream) : pc.addTrack(track);
    if (track && track.kind === 'video') {
      videoSender = sender;
    }
    return sender;
  }

  /**
   * Design §3.3 п.2/§7.2: замена видео-дорожки на уже существующем sender'е
   * этого соединения — БЕЗ renegotiation (m-line сохраняется). `track ===
   * null` — release (выключение камеры); ненулевой `track` — включение или
   * повторное подключение. Используется `mediaController`/`MeshManager`
   * (задачи 21/23) как одна из целей `deps.getVideoSenders()` — интерфейс
   * этого метода намеренно совпадает по форме с нативным
   * `RTCRtpSender.replaceTrack(track)`.
   *
   * Если видео-sender ещё не создавался (`addTrack` с видео-дорожкой не
   * вызывался) и передан ненулевой `track` — добавляет новый sender вместо
   * замены (edge case; в штатном потоке m-line уже установлен через
   * `addTrack` при первичном подключении медиа, Design §7.1).
   *
   * @param {MediaStreamTrack | null} track
   * @returns {Promise<void>}
   */
  async function replaceTrack(track) {
    if (videoSender) {
      await videoSender.replaceTrack(track);
      return;
    }
    if (track) {
      videoSender = pc.addTrack(track);
    }
  }

  /**
   * Подписка на входящие удалённые дорожки (Design §7.1, «агрегирует
   * remote-streams» на стороне `MeshManager`). Может быть вызвана в любой
   * момент — сработает на любое будущее нативное `ontrack`.
   *
   * @param {(event: RTCTrackEvent) => void} cb
   * @returns {() => void} функция отписки.
   */
  function onTrack(cb) {
    trackHandlers.add(cb);
    return () => trackHandlers.delete(cb);
  }

  /**
   * Подписка на локально сгенерированные ICE-кандидаты (Design §7.1 «par ICE
   * trickle») — вызывающая сторона (`MeshManager`) ретранслирует их серверу
   * как `signal:ice{to,candidate}`. Маркер конца сбора кандидатов
   * (`candidate === null`) в подписчиков не пробрасывается (см. выше).
   *
   * @param {(candidate: RTCIceCandidate) => void} cb
   * @returns {() => void} функция отписки.
   */
  function onIceCandidate(cb) {
    iceCandidateHandlers.add(cb);
    return () => iceCandidateHandlers.delete(cb);
  }

  /**
   * Закрывает нативное соединение (Design §7.3 «pc[id].close()» при
   * выходе/обрыве пира). Идемпотентность обеспечивает сам браузерный API
   * (повторный `close()` на уже закрытом соединении — безопасный no-op).
   */
  function close() {
    pc.close();
  }

  return {
    createOffer,
    acceptOffer,
    acceptAnswer,
    addIce,
    addTrack,
    replaceTrack,
    onTrack,
    onIceCandidate,
    close,
  };
}
