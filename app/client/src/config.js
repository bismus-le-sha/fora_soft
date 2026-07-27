/**
 * Единый источник клиентской конфигурации: ICE-серверы (STUN) и URL
 * сигнального сервера (Socket.io).
 *
 * Requirements: F-34, SEC-17. Design: §3.2, §4.2, §9.3, §10.5.
 */

/**
 * ICE-серверы для WebRTC (публичные Google STUN, без TURN — PRD §7, F-34).
 * Значения зеркалят `app/server/src/config.js#ICE_SERVERS` — единый список
 * согласован на уровне продуктовых требований (§9.3), а не общего модуля,
 * т.к. клиент и сервер — раздельные npm-workspaces без shared-пакета
 * (Design §3.2). Это статический дефолт: реальный список приходит от
 * сервера в `join:ok.iceServers` (SEC-17, §6.2) и имеет приоритет — данный
 * массив используется как fallback до входа в комнату / если сервер его не
 * прислал.
 *
 * Недостижимость STUN не должна ронять приложение (SEC-17, graceful
 * degradation) — это ответственность потребителей (MeshManager/
 * PeerConnection, задачи 21+), не этого модуля.
 */
export const ICE_SERVERS = Object.freeze([
  Object.freeze({ urls: 'stun:stun.l.google.com:19302' }),
  Object.freeze({ urls: 'stun:stun1.l.google.com:19302' }),
]);

/**
 * URL сигнального сервера (Socket.io).
 *
 * Пустая строка означает «тот же origin, что и страница» — единственный
 * корректный дефолт под зафиксированную single-origin-модель (Design
 * §3.2/§10.4): в dev Vite-прокси перенаправляет `/socket.io` на
 * Express-сервер (см. `vite.config.js`), в проде Express сам отдаёт и
 * статику, и Socket.io с одного origin за реверс-прокси (SEC-12/13/15).
 * `socket.io-client` при пустой строке/её отсутствии подключается к
 * `window.location`, поэтому явно вычислять хост/порт здесь не требуется.
 *
 * Переопределяется через `VITE_SIGNALING_URL` (build-time env, Vite) —
 * задел на нестандартные деплой-топологии, где сигналинг живёт на другом
 * origin; в норме не задаётся.
 */
export const SIGNALING_URL = (import.meta.env && import.meta.env.VITE_SIGNALING_URL) || '';
