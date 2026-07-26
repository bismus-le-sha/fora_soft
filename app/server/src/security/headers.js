/**
 * Secure HTTP-заголовки (SEC-13) под модель **single-origin за реверс-прокси**
 * (Design §10.3/§10.4): TLS/WSS терминируется nginx/Caddy перед Node, клиент
 * и Socket.io отдаются с одного origin.
 *
 * Заголовки:
 *  - `Content-Security-Policy` — `default-src 'self'`; `connect-src 'self'
 *    wss://<PROD_DOMAIN> stun:stun.l.google.com:19302` (Socket.io + ICE);
 *    `script-src 'self'` (без `'unsafe-inline'` — усиливает SEC-04, XSS
 *    рендерится только как текст, инлайн-скрипт исполниться не может);
 *    `img-src 'self' data:` (силуэт-заглушка); `media-src 'self' blob:`
 *    (локальный/удалённый `MediaStream`); `frame-ancestors 'none'` (не даёт
 *    встроить приложение в чужой `<iframe>` — вместе с `X-Frame-Options`
 *    защита от clickjacking).
 *  - `X-Content-Type-Options: nosniff` — браузер не переопределяет
 *    заявленный `Content-Type` угадыванием (MIME-sniffing).
 *  - `Referrer-Policy: no-referrer` — URL комнаты (содержит `roomId`,
 *    единственный секрет входа, SEC-14/21) не утекает в `Referer` при
 *    переходе на внешний ресурс.
 *  - `X-Frame-Options: DENY` — legacy-дублирование `frame-ancestors` для
 *    браузеров без поддержки CSP3.
 *  - `Strict-Transport-Security` (HSTS) — **только в проде**
 *    (`NODE_ENV==='production'`); в dev не выставляется, т.к. dev идёт по
 *    `http://localhost` без TLS (HSTS сломал бы обычный http-доступ).
 *
 * `<PROD_DOMAIN>` — плейсхолдер, читается из `config.js` (`PROD_DOMAIN`,
 * env при деплое), по той же схеме, что `ALLOWED_ORIGIN` (SEC-15).
 *
 * Wiring (НЕ входит в объём задачи 7): сервер сейчас — голый `http.Server`
 * (`index.js`) + Express-инстанс, используемый только под `/healthz`, и
 * Socket.io gateway (`socket/gateway.js`, задача 6), который сам заголовки
 * не выставляет. Подключение `createSecurityHeadersMiddleware(config)` через
 * `app.use(...)` в `index.js` — самостоятельный шаг вне критериев приёмки
 * этой задачи (план явно ограничивает задачу 7 модулями `security/headers.js`
 * и `logger.js`); выполняется отдельно (wiring вместе с задачей 8 либо
 * отдельным шагом).
 *
 * Requirements: SEC-04, SEC-13, SEC-14/21. Design: §10.4, §14.
 */

/**
 * Собирает значение заголовка `Content-Security-Policy` под модель
 * single-origin.
 *
 * @param {{PROD_DOMAIN: string}} config — обычно весь модуль `config.js`
 *   (`import * as config from '../config.js'`); домен ЧИТАЕТСЯ отсюда, а не
 *   хардкодится.
 * @returns {string}
 */
export function buildContentSecurityPolicy(config) {
  const { PROD_DOMAIN: prodDomain } = config;

  return [
    "default-src 'self'",
    `connect-src 'self' wss://${prodDomain} stun:stun.l.google.com:19302`,
    "script-src 'self'",
    "img-src 'self' data:",
    "media-src 'self' blob:",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * Собирает полный набор secure-заголовков как plain-object
 * (`имя заголовка -> значение`) — без зависимости от Express/`http`, удобно
 * для юнит-тестов и для установки через `res.setHeader` в любом окружении.
 *
 * @param {{PROD_DOMAIN: string}} config — обычно весь модуль `config.js`.
 * @param {boolean} [isProduction] — включает HSTS; по умолчанию
 *   `process.env.NODE_ENV === 'production'` (передаётся явно тестами).
 * @returns {Record<string, string>}
 */
export function buildSecurityHeaders(
  config,
  isProduction = process.env.NODE_ENV === 'production',
) {
  const headers = {
    'Content-Security-Policy': buildContentSecurityPolicy(config),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
  };

  if (isProduction) {
    // 2 года, поддомены, разрешение на preload-список браузеров — стандартный
    // hardened пресет для single-origin прод-домена за TLS-терминирующим прокси.
    headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains; preload';
  }

  return headers;
}

/**
 * Express-style middleware factory: `app.use(createSecurityHeadersMiddleware(config))`.
 * Совместим с голым `http.createServer` request-хендлером — сигнатура
 * `(req, res, next)` идентична; для чистого `http` вызвать `next` без
 * аргументов эквивалентно продолжению обработки.
 *
 * @param {{PROD_DOMAIN: string}} config — обычно весь модуль `config.js`.
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, next: () => void) => void}
 */
export function createSecurityHeadersMiddleware(config) {
  return function securityHeadersMiddleware(req, res, next) {
    const headers = buildSecurityHeaders(config);
    for (const [name, value] of Object.entries(headers)) {
      res.setHeader(name, value);
    }
    next();
  };
}

export default createSecurityHeadersMiddleware;
