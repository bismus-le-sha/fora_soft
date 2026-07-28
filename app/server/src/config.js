/**
 * Единый источник конфигурации и числовых лимитов сервера.
 *
 * Значения утверждены продуктовой командой (TDD design-video-chat-room.md §9.3).
 * Все правки лимитов — ТОЛЬКО здесь; magic numbers по остальному коду не
 * разбрасывать. Секретов/ключей тут нет — только публичные лимиты и URL.
 *
 * Requirements: F-05, F-38, F-40, SEC-01, SEC-02, SEC-05, SEC-08, SEC-09,
 * SEC-10, SEC-14, SEC-15, SEC-17. Design: §9.3.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Порт HTTP/Socket.io сервера. */
export const PORT = Number(process.env.PORT) || 3001;

/**
 * Прод-сборка клиента (Vite `vite build` → app/client/dist, Design §3.2/§12.2).
 * Переопределяется через env для нестандартных layout'ов деплоя.
 */
export const CLIENT_DIST_DIR =
  process.env.CLIENT_DIST_DIR || path.join(__dirname, '../../client/dist');

/**
 * Признак production-окружения (`NODE_ENV === 'production'`). Единая точка
 * чтения `process.env.NODE_ENV` для этого флага (было продублировано буквально
 * в `index.js`, `security/headers.js`, `socket/gateway.js`). Функция, а не
 * статическая константа, вычисленная один раз при импорте: тесты этих трёх
 * модулей переключают `process.env.NODE_ENV` по ходу выполнения в рамках
 * одного процесса (см. `socket/gateway.test.js`, `security/headers.test.js`)
 * и ожидают, что проверка увидит актуальное значение на момент вызова.
 */
export function isProduction() {
  return process.env.NODE_ENV === 'production';
}

/** Макс. длина имени участника, символов. SEC-01, F-38. */
export const NAME_MAX = 30;

/** Макс. длина текста сообщения чата, символов. SEC-02/08. */
export const MESSAGE_MAX = 500;

/** Макс. число сообщений в истории комнаты (ring-buffer). SEC-09. */
export const HISTORY_MAX = 200;

/** Жёсткий лимит участников одной комнаты. F-05. */
export const ROOM_CAPACITY = 4;

/** Макс. число одновременно существующих комнат в RAM. SEC-10. */
export const ROOMS_MAX = 1000;

/** Макс. размер входящего Socket.io-фрейма в байтах (64 KB). SEC-08. */
export const MAX_HTTP_BUFFER_SIZE = 65536;

/**
 * Лимиты token-bucket rate-limit по категориям событий (SEC-05).
 * `points` — сколько событий разрешено за `durationMs` (burst = points).
 */
export const RATE_LIMIT = Object.freeze({
  chat: Object.freeze({ points: 5, durationMs: 2000 }),
  signal: Object.freeze({ points: 50, durationMs: 1000 }),
  join: Object.freeze({ points: 5, durationMs: 10000 }),
});

/**
 * ICE-серверы для WebRTC (публичные Google STUN, без TURN — PRD §7, F-34).
 * Дублируются клиенту в `join:ok.iceServers` (SEC-17).
 */
export const ICE_SERVERS = Object.freeze([
  Object.freeze({ urls: 'stun:stun.l.google.com:19302' }),
  Object.freeze({ urls: 'stun:stun1.l.google.com:19302' }),
]);

/**
 * Разрешённый origin для CORS Socket.io/HTTP (SEC-15).
 * В проде подставляется через env при деплое; wildcard '*' в проде
 * запрещён — проверяется в `socket/gateway.js` (задача 6).
 *
 * Дефолт — `http://127.0.0.1:5173`, а не `http://localhost:5173`: Vite dev-
 * сервер (`app/client/vite.config.js`) слушает `127.0.0.1` явно (не
 * `localhost`, во избежание dual-stack IPv4/IPv6 на Windows), и README
 * инструктирует открывать именно `http://127.0.0.1:5173`. Реальный браузер
 * на этом хосте шлёт `Origin: http://127.0.0.1:5173` — при дефолте
 * `localhost` gateway (`socket/gateway.js`) отклонял handshake 403-м, из-за
 * чего клиент штатно показывал `ServerDownBanner` («Ошибка сервера») сразу
 * после установки проекта по инструкции.
 */
export const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://127.0.0.1:5173';

/**
 * Прод-домен (host, без схемы) для CSP `connect-src` (`wss://<PROD_DOMAIN>`,
 * SEC-13). Плейсхолдер — подставляется через env при деплое (Design §10.4,
 * §14 «Остаётся уточнить при деплое»); в dev не участвует в реальных
 * соединениях (dev идёт на `localhost`, покрыт `'self'`).
 */
export const PROD_DOMAIN = process.env.PROD_DOMAIN || 'example.com';
