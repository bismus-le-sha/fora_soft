/**
 * socket/handlers.js — каркас регистрации обработчиков Socket.io-событий.
 *
 * Design §4.1 (таблица компонентов): «Приём событий сокета, вызов
 * валидации/rate-limit, делегирование в RoomService, эмиссия ответов.
 * Никакой бизнес-логики лимита внутри.» Регистрирует: `join`, `chat:send`,
 * `media:state`, `signal:offer`/`signal:answer`/`signal:ice`, `leave`,
 * (транспортное) `disconnect` — Design §6.1.
 *
 * Единая точка входа для ВСЕХ входящих событий одного соединения —
 * `socket.onAny(...)`, а не отдельный `socket.on(...)` на каждое событие:
 * это даёт ОДИН обобщённый path для error-эмиссии (SEC-15) и гарантирует,
 * что рантайм-проверки (rate-limit → структура payload → делегирование)
 * применяются единообразно, а не дублируются в каждом хендлере. Порядок
 * проверок повторяет Design §6.1 (для каждого события: «rate-limit(...) →
 * валидация → …»):
 *   1. Неизвестное имя события (не входит в `KNOWN_EVENTS`) →
 *      `error{bad-payload}` — защищает от опечаток/чужого протокола, не
 *      привязываясь к недокументированному поведению Socket.io.
 *   2. `rateLimit.allow(socket.id, category)` для событий с категорией
 *      (`chat`/`signal`/`join`, Design §6.1/§9.3) — превышение бюджета →
 *      `error{rate-limited}`, без падения сервера (F-40, SEC-05). У `leave`
 *      категории нет (Design §6.1 не указывает rate-limit для `leave`) —
 *      троттлится естественно на стороне `disconnect`/частоты действий UI.
 *   3. Структурная валидация payload — обязан быть «plain object» (не
 *      `array`/`null`/примитив) → иначе `error{bad-payload}`. Это НЕ
 *      бизнес-валидация полей (`validateName`/`validateText` — задачи 9/11),
 *      только защита от структурно некорректного/битого входа до того, как
 *      он долетит до `RoomService`.
 *   4. Делегирование в `RoomService` (задачи 9–14, сейчас — заглушки).
 *      Любое исключение из бизнес-логики перехватывается и превращается в
 *      `error{bad-payload}` — единственный Node-процесс не должен падать от
 *      необработанного исключения в хендлере одного соединения (F-40).
 *
 * `disconnect` — зарезервированное транспортное событие Socket.io и НЕ
 * проходит через `onAny` (генерируется локально engine.io, не прилетает как
 * обычный пакет от клиента) — регистрируется отдельным `socket.on('disconnect', ...)`.
 * Там же вызывается `rateLimit.release(socket.id)` — устраняет неограниченный
 * рост module-level `buckets` Map в `lib/rateLimit.js` при churn соединений
 * (см. JSDoc этого модуля, где точка вызова была помечена TODO для задачи 8).
 *
 * Единый обобщённый error-эмиттер (SEC-15): клиенту уходит только
 * `{code, message}` из фиксированного словаря `ERROR_MESSAGES` — никаких
 * стек-трейсов/деталей исключения/внутренних состояний.
 *
 * Requirements: F-40, SEC-05, SEC-15. Design: §4.1, §6.1, §8.
 */
import defaultRateLimit from '../lib/rateLimit.js';
import defaultLogger from '../logger.js';
import defaultRoomService from '../services/RoomService.js';
import { RoomRegistry } from '../domain/RoomRegistry.js';

/** Обобщённые сообщения об ошибках клиенту (SEC-15) — без внутренних деталей. */
const ERROR_MESSAGES = Object.freeze({
  'bad-payload': 'Некорректный запрос.',
  'rate-limited': 'Слишком много запросов, попробуйте позже.',
});

/**
 * Категория rate-limit (Design §6.1/§9.3, `config.RATE_LIMIT`) для каждого
 * известного события. У событий без записи здесь (`leave`) rate-limit на
 * этом уровне не применяется.
 */
const EVENT_CATEGORY = Object.freeze({
  join: 'join',
  'chat:send': 'chat',
  'media:state': 'signal',
  'signal:offer': 'signal',
  'signal:answer': 'signal',
  'signal:ice': 'signal',
});

/** Полный набор событий, которые сервер готов принимать от клиента (Design §6.1). */
const KNOWN_EVENTS = new Set([
  'join',
  'chat:send',
  'media:state',
  'signal:offer',
  'signal:answer',
  'signal:ice',
  'leave',
]);

/** @param {unknown} value */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Единый обобщённый error-эмиттер (SEC-15) — фиксированный код + generic
 * сообщение, без внутренних деталей.
 * @param {import('socket.io').Socket} socket
 * @param {'bad-payload' | 'rate-limited'} code
 */
function emitError(socket, code) {
  socket.emit('error', { code, message: ERROR_MESSAGES[code] ?? 'Ошибка запроса.' });
}

/**
 * Делегирует известное событие в `RoomService` (задачи 9–14, сейчас —
 * заглушки, см. `services/RoomService.js`).
 * @param {string} eventName
 * @param {import('socket.io').Socket} socket
 * @param {object} payload
 * @param {{io: import('socket.io').Server, config: object, registry: RoomRegistry}} ctx
 * @param {typeof defaultRoomService} roomService
 */
function dispatch(eventName, socket, payload, ctx, roomService) {
  switch (eventName) {
    case 'join':
      return roomService.join(socket, payload, ctx);
    case 'chat:send':
      return roomService.postChat(socket, payload, ctx);
    case 'media:state':
      return roomService.setMedia(socket, payload, ctx);
    case 'signal:offer':
      return roomService.relaySignal(socket, 'offer', payload, ctx);
    case 'signal:answer':
      return roomService.relaySignal(socket, 'answer', payload, ctx);
    case 'signal:ice':
      return roomService.relaySignal(socket, 'ice', payload, ctx);
    case 'leave':
      return roomService.leave(socket, ctx);
    default:
      // Недостижимо: имя события уже отфильтровано через KNOWN_EVENTS выше.
      return undefined;
  }
}

/**
 * Регистрирует каркас обработчиков на каждое новое соединение `io`.
 *
 * @param {import('socket.io').Server} io — экземпляр, возвращённый `createGateway` (задача 6).
 * @param {object} config — обычно весь модуль `config.js` (`import * as config from '../config.js'`).
 * @param {{
 *   registry?: RoomRegistry,
 *   rateLimit?: {allow: Function, release: Function},
 *   logger?: {log: Function},
 *   roomService?: typeof defaultRoomService,
 * }} [deps] — точки подмены для тестов; в проде не передаются (берутся дефолты).
 * @returns {void}
 */
export function registerHandlers(io, config, deps = {}) {
  const {
    registry = new RoomRegistry(),
    rateLimit = defaultRateLimit,
    logger = defaultLogger,
    roomService = defaultRoomService,
  } = deps;

  const ctx = { io, config, registry };

  io.on('connection', (socket) => {
    socket.onAny((eventName, payload) => {
      if (!KNOWN_EVENTS.has(eventName)) {
        emitError(socket, 'bad-payload');
        return;
      }

      const category = EVENT_CATEGORY[eventName];
      if (category && !rateLimit.allow(socket.id, category)) {
        emitError(socket, 'rate-limited');
        return;
      }

      // Клиенты без содержательного payload (напр. `leave`) могут не
      // передать аргумент вовсе — трактуем это как пустой объект, а не как
      // структурно битый payload. Для `leave` ЕЩЁ и `null` трактуется так же
      // (задача 32): реальный `signalingClient.emit(event, payload)`
      // (`app/client/src/signalingClient.js`) форвардит `payload` в
      // `socket.emit` ВСЕГДА вторым позиционным аргументом, даже когда его
      // значение `undefined` — `JSON.stringify(['leave', undefined])` на
      // проводе даёт буквальный `null`, а не «аргумент отсутствует» (это
      // отличается от вызова без второго аргумента вовсе). Без этого частного
      // случая настоящий браузерный клиент, эмитящий `leave` штатным путём
      // (`RoomScreen`/`ControlBar`), всегда получал бы `error{bad-payload}`, и
      // выход из комнаты по кнопке молча игнорировался бы (обнаружено
      // E2E-smoke в реальном Chromium, не покрывалось Node-интеграционными
      // тестами — см. `handlers.test.js`). НЕ распространяется на остальные
      // события (`media:state`/`chat:send`/`signal:*`) — им `payload: null`
      // по-прежнему структурно некорректен и остаётся `bad-payload` (см.
      // параметризованный тест «битый payload известного события» ниже) —
      // только `leave` в принципе не требует полей payload.
      const normalizedPayload =
        payload === undefined || (payload === null && eventName === 'leave') ? {} : payload;
      if (!isPlainObject(normalizedPayload)) {
        emitError(socket, 'bad-payload');
        return;
      }

      try {
        dispatch(eventName, socket, normalizedPayload, ctx, roomService);
      } catch {
        // Бизнес-логика (задачи 9-14) не должна ронять процесс из-за одного
        // некорректного события одного соединения (F-40) — деталь исключения
        // клиенту не передаётся (SEC-15).
        logger.log('handler-error', { socketId: socket.id });
        emitError(socket, 'bad-payload');
      }
    });

    socket.on('disconnect', () => {
      // Освобождаем токены rate-limit этого соединения (устраняет
      // неограниченный рост `buckets` в lib/rateLimit.js при churn).
      rateLimit.release(socket.id);
      try {
        roomService.leave(socket, ctx);
      } catch {
        // Cleanup при обрыве не должен падать процесс (F-40).
        logger.log('handler-error', { socketId: socket.id });
      }
    });
  });
}

export default { registerHandlers };
