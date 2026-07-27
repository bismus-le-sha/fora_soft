import { useEffect, useRef } from 'react';
import { createSignalingClient } from '../signalingClient.js';

/**
 * useSignaling.js — React-хук-обёртка над `signalingClient.js` (задача 24).
 *
 * Design §4.2 (таблица компонентов клиента): «`RoomScreen.jsx` | Оркестрация:
 * media → mesh → signaling; …». Этот хук инкапсулирует именно сигнальную
 * часть оркестрации: обязательный порядок `connect()` → `on(...)` →
 * `emit('join', ...)` (см. JSDoc `signalingClient.js` — `on()`/`emit()`
 * бросают `Error`, если вызваны до `connect()`).
 *
 * Design §6.1/§6.2 — протокол сигналинга: хук подписывается на ВСЕ события
 * Server→Client и форвардит каждое вызывающей стороне через именованный
 * callback в `handlers` (RoomScreen сам владеет React-state — селф-id,
 * список участников, сообщения, — это явно его обязанность по плану задачи
 * 24, а не этого хука). Хук намеренно НЕ хранит копию состояния — только
 * плюмбинг подключения и подписок.
 *
 * Design §7.1 (sequence «Вход и установка mesh»): `join { roomId, name }`
 * отправляется сразу после подписок, при первом переходе `enabled` в `true`.
 * `enabled` позволяет вызывающей стороне (`RoomScreen`) отложить сетевой вход
 * до момента, когда локальное медиа уже получено (`media.init()`
 * завершился) — именно такой порядок «media → mesh → signaling» описан в
 * плане задачи 24 и в sequence §7.1 («getUserMedia» ДО «join»).
 *
 * Requirements: F-07, F-16, US-6, US-9. Design: §4.2, §5.3, §6.1, §6.2, §7.1.
 */

/** Design §6.2 — событие Server→Client → имя callback-а в `handlers`. */
const SERVER_EVENT_TO_HANDLER = {
  'join:ok': 'onJoinOk',
  'join:rejected': 'onJoinRejected',
  'participant:joined': 'onParticipantJoined',
  'participant:left': 'onParticipantLeft',
  'chat:message': 'onChatMessage',
  'chat:system': 'onChatSystem',
  'media:state': 'onMediaState',
  'signal:offer': 'onSignalOffer',
  'signal:answer': 'onSignalAnswer',
  'signal:ice': 'onSignalIce',
};

/**
 * @param {object} [options]
 * @param {string} [options.roomId] — Design §6.1 `join { roomId, name }`.
 * @param {string} [options.name]
 * @param {boolean} [options.enabled] — если `false`, хук не подключается и не
 *   входит в комнату (см. JSDoc модуля выше про порядок media → signaling).
 *   По умолчанию `true` — подключение происходит немедленно при маунте.
 * @param {object} [options.handlers] — callback-и по имени события
 *   (`onJoinOk`, `onJoinRejected`, `onParticipantJoined`, `onParticipantLeft`,
 *   `onChatMessage`, `onChatSystem`, `onMediaState`, `onSignalOffer`,
 *   `onSignalAnswer`, `onSignalIce`, `onConnectionError`). Читаются через
 *   `useRef`, обновляются каждый рендер — можно передавать «свежие» замыкания
 *   без пересоздания подписок.
 * @param {object} [options.deps]
 * @param {(deps?: object) => ReturnType<typeof createSignalingClient>} [options.deps.createSignalingClient]
 *   — фабрика клиента, по умолчанию реальный `createSignalingClient`; параметр
 *   только для тестируемости (тот же DI-приём, что `deps.createPeerConnection`
 *   в `MeshManager.js`).
 * @param {object} [options.deps.clientDeps] — форвардится в фабрику как есть
 *   (например `deps.io`/`deps.url` реального `createSignalingClient`).
 * @returns {{ emit: (event: string, payload?: object) => void }}
 */
export function useSignaling({ roomId, name, enabled = true, handlers, deps } = {}) {
  const handlersRef = useRef(handlers ?? {});
  handlersRef.current = handlers ?? {};

  /**
   * Ленивая инициализация в теле рендера (не в эффекте) — так `emit`
   * доступен вызывающей стороне синхронно с первого рендера, ещё до того,
   * как эффект ниже успел вызвать `connect()` (см. `useMesh`/`useMedia`,
   * которым нужна стабильная ссылка на `emit` независимо от момента
   * реального подключения).
   */
  const clientRef = useRef(null);
  if (!clientRef.current) {
    const createClient = deps?.createSignalingClient ?? createSignalingClient;
    clientRef.current = createClient(deps?.clientDeps);
  }

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const client = clientRef.current;
    client.connect();

    for (const [event, handlerName] of Object.entries(SERVER_EVENT_TO_HANDLER)) {
      client.on(event, (payload) => {
        handlersRef.current[handlerName]?.(payload);
      });
    }

    const offError = client.onError((reason) => {
      handlersRef.current.onConnectionError?.(reason);
    });

    client.emit('join', { roomId, name });

    return () => {
      offError();
      client.disconnect();
    };
    // roomId/name/handlers намеренно не в deps: вход в комнату происходит
    // ровно один раз за жизненный цикл `RoomScreen` (переход `enabled`
    // false→true после готовности медиа); handlers читаются через
    // handlersRef.current и всегда актуальны на момент срабатывания события.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { emit: clientRef.current.emit };
}
