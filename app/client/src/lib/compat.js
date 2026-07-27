/**
 * Preflight-детект поддержки WebRTC и связанных браузерных API (F-36, US-13).
 *
 * Design §4.2 (App.jsx: «preflight-проверка окружения»), §8 (кейс «Браузер
 * без WebRTC» → `compat.js` детект `RTCPeerConnection`/`getUserMedia` →
 * экран «WebRTC не поддерживается», приложение не грузит комнату).
 *
 * PRD F-36 (Must): если браузер не поддерживает WebRTC или слишком старый —
 * показать сообщение о неподдержке. PRD §7 «HTTPS обязателен»: `getUserMedia`
 * и WebRTC работают только в защищённом контексте (HTTPS или localhost) —
 * без него API либо отсутствуют, либо откажут при вызове, поэтому secure
 * context — часть preflight-проверки, а не только «есть конструктор».
 *
 * Все проверки — чистое чтение глобальных объектов, без побочных эффектов
 * (никаких `getUserMedia()`-вызовов здесь: сам запрос устройств — задача
 * `mediaController.js`, задача 21).
 */

/**
 * @param {typeof globalThis} target — источник глобальных браузерных API;
 *   параметр только для тестируемости (позволяет подставить фейковый объект
 *   вместо мутации реального `window` в юнит-тестах). В runtime всегда
 *   вызывается с дефолтом.
 * @returns {boolean} true, если конструктор `RTCPeerConnection` доступен.
 */
export function hasRTCPeerConnection(target) {
  target ??= globalThis;
  return typeof target.RTCPeerConnection === 'function';
}

/**
 * @param {typeof globalThis} target
 * @returns {boolean} true, если `navigator.mediaDevices.getUserMedia`
 *   доступен (современный promise-based API; устаревший
 *   `navigator.getUserMedia` сознательно не проверяется — не входит в
 *   зафиксированную матрицу поддерживаемых браузеров, Design §7 «Chrome
 *   100+, Firefox 100+, Edge 100+»).
 */
export function hasGetUserMedia(target) {
  target ??= globalThis;
  const mediaDevices = target.navigator && target.navigator.mediaDevices;
  return !!mediaDevices && typeof mediaDevices.getUserMedia === 'function';
}

/**
 * @param {typeof globalThis} target
 * @returns {boolean} true, если страница выполняется в защищённом контексте
 *   (HTTPS или localhost) — браузер сам вычисляет `window.isSecureContext`
 *   по алгоритму Secure Contexts; при отсутствии свойства (очень старый
 *   браузер) считаем контекст незащищённым — fail-closed.
 */
export function isSecureContext(target) {
  target ??= globalThis;
  return target.isSecureContext === true;
}

/**
 * Сводный preflight-детект окружения (F-36, US-13).
 *
 * @param {typeof globalThis} target
 * @returns {{webrtc: boolean, getUserMedia: boolean, secureContext: boolean, supported: boolean}}
 *   Флаги по каждой проверке + агрегированный `supported` (AND всех трёх).
 *   `supported === false` — сигнал для `App.jsx` показать фатальный экран
 *   «WebRTC не поддерживается» вместо загрузки комнаты.
 */
export function checkWebrtcSupport(target) {
  target ??= globalThis;
  const webrtc = hasRTCPeerConnection(target);
  const getUserMedia = hasGetUserMedia(target);
  const secureContext = isSecureContext(target);

  return {
    webrtc,
    getUserMedia,
    secureContext,
    supported: webrtc && getUserMedia && secureContext,
  };
}
