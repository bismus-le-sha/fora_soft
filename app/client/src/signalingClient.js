/**
 * signalingClient.js — тонкая типобезопасная обёртка над socket.io-client.
 *
 * Design §4.2 (таблица компонентов): «socket.io-client: connect(WSS),
 * emit/on обёртки, реэмиссия ошибок соединения (US-13 «сервер недоступен»)».
 * Интерфейс строго по таблице: `connect()`, `emit(event,payload)`,
 * `on(event,cb)`, `onError(cb)`.
 *
 * Design §6 — единственный сетевой контракт приложения (события Socket.io).
 * `emit`/`on` в этом модуле принимают **только** имена событий из контракта:
 * §6.1 (Client→Server) — для `emit`, §6.2 (Server→Client) — для `on`.
 * Событие из чужого направления или опечатка сразу бросает `TypeError` —
 * типобезопасность на границе модуля, а не тихая потеря пакета где-то в
 * сети/на сервере.
 *
 * Design §8 «Сигнальный сервер недоступен» → `connect_error`/timeout socket.io
 * → баннер «Ошибка сервера»; без белого экрана. Сам баннер — компонент
 * `components/errors/` по прецеденту `NoWebRtcBanner.jsx` (задача 17), но
 * рендерится он отдельной задачей 30 («Баннеры ошибок и состояний») — вне
 * скоупа этого модуля. Здесь только реэмиссия через `onError(cb)`: единый
 * канал, через который будущий потребитель (`RoomScreen`/`App.jsx`) сможет
 * узнать о недоступности сервера и показать баннер, не завязываясь на
 * внутренности socket.io-client.
 *
 * Requirements: F-35, US-13. Design: §4.2, §6, §8.
 */
import { io as defaultIo } from 'socket.io-client';
import { SIGNALING_URL } from './config.js';

/** Design §6.1 — события, которые клиент имеет право ОТПРАВЛЯТЬ серверу. */
const CLIENT_TO_SERVER_EVENTS = new Set([
  'join',
  'chat:send',
  'media:state',
  'signal:offer',
  'signal:answer',
  'signal:ice',
  'leave',
]);

/** Design §6.2 — события, на которые клиент имеет право ПОДПИСЫВАТЬСЯ. */
const SERVER_TO_CLIENT_EVENTS = new Set([
  'join:ok',
  'join:rejected',
  'participant:joined',
  'participant:left',
  'chat:message',
  'chat:system',
  'media:state',
  'signal:offer',
  'signal:answer',
  'signal:ice',
  'error',
]);

/**
 * Создаёт изолированный экземпляр обёртки сигналинга. Фабрика возвращает
 * новый объект с собственным замкнутым состоянием (не module-level
 * singleton) — так тесты и потенциальные повторные входы в комнату не
 * делят между собой один и тот же сокет/список подписчиков ошибок.
 *
 * @param {object} [deps]
 * @param {(url: string | undefined, opts?: object) => import('socket.io-client').Socket} [deps.io]
 *   Фабрика сокета — по умолчанию реальный `io` из `socket.io-client`.
 *   Параметр существует только для тестируемости (инъекция фейкового
 *   сокета вместо настоящего сетевого соединения) — тот же DI-приём, что
 *   параметр `target` в `lib/compat.js` (задача 17).
 * @param {string} [deps.url] — URL сигнального сервера, по умолчанию
 *   `config.SIGNALING_URL` (единый источник, Design §4.2/§9.3).
 * @returns {{
 *   connect: () => import('socket.io-client').Socket,
 *   emit: (event: string, payload?: object) => void,
 *   on: (event: string, cb: (payload: object) => void) => void,
 *   onError: (cb: (reason: Error) => void) => () => void,
 *   disconnect: () => void,
 * }}
 */
export function createSignalingClient(deps = {}) {
  const ioFactory = deps.io ?? defaultIo;
  const configuredUrl = deps.url ?? SIGNALING_URL;

  /** @type {import('socket.io-client').Socket | null} */
  let socket = null;
  const errorHandlers = new Set();
  /**
   * Подписки, зарегистрированные через `on(event, cb)`. Хранятся в замкнутом
   * состоянии (не только на текущем `socket`-инстансе) по той же причине,
   * что и `errorHandlers` выше: `disconnect()` → `connect()` создаёт новый
   * сокет через `ioFactory()` без каких-либо слушателей — без этого списка
   * все `on()`-подписки предыдущего сокета молча терялись бы при
   * переподключении (например, `chat:message` переставал бы доходить после
   * обрыва связи и восстановления, без единой ошибки-сигнала об этом).
   *
   * @type {Array<{ event: string, cb: (payload: object) => void }>}
   */
  const eventSubscriptions = [];

  /**
   * @param {Error} reason
   *
   * Каждый handler изолирован try/catch: падение одного подписчика не
   * должно останавливать доставку `connect_error` остальным (иначе один
   * упавший потребитель тихо гасит уведомление, например, о баннере
   * «Ошибка сервера» для всех остальных).
   */
  function notifyError(reason) {
    for (const handler of errorHandlers) {
      try {
        handler(reason);
      } catch {
        // Ошибка подписчика не должна прерывать рассылку остальным (см. выше).
      }
    }
  }

  /**
   * Устанавливает соединение (если ещё не установлено) и подписывает
   * внутренний реэмиттер ошибок на `connect_error`. socket.io-client сам
   * эмитит `connect_error` и в случае явного отказа сервера, и в случае
   * истечения таймаута первичной попытки подключения (Manager-опция
   * `timeout`, дефолт socket.io) — поэтому единственной подписки достаточно,
   * чтобы покрыть оба сценария из Design §8 («connect_error/timeout»).
   *
   * Идемпотентна — повторный вызов без предшествующего `disconnect()`
   * возвращает уже существующий сокет, не плодит параллельные соединения.
   *
   * `SIGNALING_URL === ''` (Design §4.2/§9.3, «тот же origin, что и
   * страница») намеренно преобразуется в `undefined` перед передачей в
   * `io()`: у `socket.io-client` `undefined`/отсутствие `uri` — штатный
   * сигнал «подключиться к `window.location`», тогда как буквальная пустая
   * строка парсится как некорректный URL с пустым host (проверено эмпирически
   * против `socket.io-client`).
   *
   * @returns {import('socket.io-client').Socket}
   */
  function connect() {
    if (socket) {
      return socket;
    }

    socket = ioFactory(configuredUrl || undefined, {});
    socket.on('connect_error', notifyError);
    for (const { event, cb } of eventSubscriptions) {
      socket.on(event, cb);
    }

    return socket;
  }

  /**
   * @param {string} event — имя события из Design §6.1 (Client→Server).
   * @param {object} [payload]
   */
  function emit(event, payload) {
    if (!CLIENT_TO_SERVER_EVENTS.has(event)) {
      throw new TypeError(
        `signalingClient.emit: неизвестное событие "${event}" — нет в контракте Design §6.1 (Client→Server)`,
      );
    }
    if (!socket) {
      throw new Error('signalingClient.emit: соединение не установлено — сначала вызовите connect()');
    }
    socket.emit(event, payload);
  }

  /**
   * Подписка запоминается в `eventSubscriptions` и переустанавливается на
   * новый сокет при каждом следующем `connect()` — переживает цикл
   * `disconnect()` → `connect()` симметрично с `onError()` (см. выше).
   *
   * @param {string} event — имя события из Design §6.2 (Server→Client).
   * @param {(payload: object) => void} cb
   */
  function on(event, cb) {
    if (!SERVER_TO_CLIENT_EVENTS.has(event)) {
      throw new TypeError(
        `signalingClient.on: неизвестное событие "${event}" — нет в контракте Design §6.2 (Server→Client)`,
      );
    }
    if (!socket) {
      throw new Error('signalingClient.on: соединение не установлено — сначала вызовите connect()');
    }
    eventSubscriptions.push({ event, cb });
    socket.on(event, cb);
  }

  /**
   * Подписка на реэмиссию ошибок соединения (US-13 «сервер недоступен»,
   * Design §8). Может быть вызвана до `connect()` — колбэк хранится в
   * замкнутом `Set`, не на самом сокете, поэтому не теряется при
   * (пере)подключении.
   *
   * @param {(reason: Error) => void} cb
   * @returns {() => void} функция отписки.
   */
  function onError(cb) {
    errorHandlers.add(cb);
    return () => errorHandlers.delete(cb);
  }

  /**
   * Закрывает текущее соединение и сбрасывает ссылку на сокет (cleanup).
   * `errorHandlers`/`eventSubscriptions` намеренно не очищаются — они живут
   * в замкнутом состоянии обёртки, а не на сокете, и должны пережить цикл
   * `disconnect()` → `connect()` (см. `onError`/`on` выше).
   */
  function disconnect() {
    if (!socket) {
      return;
    }
    socket.off('connect_error', notifyError);
    socket.disconnect();
    socket = null;
  }

  return { connect, emit, on, onError, disconnect };
}
