import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSignaling } from '../hooks/useSignaling.js';
import { useMesh } from '../hooks/useMesh.js';
import { useMedia } from '../hooks/useMedia.js';

/**
 * RoomScreen.jsx — экран комнаты: оркестрация media → mesh → signaling
 * (задача 24).
 *
 * Design §4.2 (таблица компонентов клиента): «`RoomScreen.jsx` | Оркестрация:
 * media → mesh → signaling; раскладка (VideoGrid + ControlBar + ChatPanel +
 * ParticipantList). | —».
 * Design §5.3: «Состояние клиента (только RAM вкладки)… Всё в React-state:
 * `selfId`, `participants[]`, `messages[]`, `localStream`, `mediaState`,
 * `peers`. Перезагрузка = новый вход (F-28).» Здесь `selfId`/`participants`/
 * `messages` — React state этого компонента; `localStream`/`mediaState` —
 * состояние `useMedia`; `peers`/`remoteStreams` — состояние `useMesh`.
 *
 * Design §7.1 (sequence «Вход и установка mesh»): порядок — `getUserMedia`
 * (audio+video) → `join {roomId, name}` → (для старожилов) `signal:offer` →
 * … Здесь это реализовано через `useMedia().init()` на маунте, и только
 * ПОСЛЕ его завершения (успех/неуспех — не важно, Design §8 «остаться в
 * комнате с off») хук сигналинга переходит `enabled: false → true` и
 * реально подключается + шлёт `join`.
 *
 * Design §6.2 (`join:ok { selfId, participants, history, iceServers }`):
 * снимок раскладывается в state; для каждого участника из снимка, КРОМЕ
 * self, вызывается `mesh.addExistingParticipant(id)` (self — новичок
 * относительно них, offer не создаёт, Design §7.1 «правило инициативы»);
 * локальные треки прикрепляются к уже созданным `PeerConnection`
 * (`attachLocalTrack`).
 *
 * `VideoGrid`/`ControlBar`/`ChatPanel`/`ParticipantList` — отдельные будущие
 * задачи 25-29 (ещё не существуют). Здесь — минимальная инлайн-разметка,
 * достаточная для критерия приёмки задачи 24 («при `join:ok` рендерится
 * сетка+чат+список; `participant:joined/left` обновляют состав»); задачи
 * 25-29 заменят эту разметку на выделенные компоненты без изменения
 * оркестрации в этом файле.
 *
 * Requirements: F-07, F-16, US-6, US-9. Design: §4.2, §5.3, §7.1.
 */

/* eslint-disable react/prop-types -- проект типизирует пропсы JSDoc-аннотациями
   (см. JoinGate.jsx/StartScreen.jsx), PropTypes не подключена (Design §3.2/§10.5 SEC-19). */

/**
 * @param {object} props
 * @param {string} props.roomId — id комнаты из URL (Design §6.1 `join.roomId`).
 * @param {string} props.name — имя, введённое в `JoinGate` (Design §6.1 `join.name`).
 * @param {object} [props.deps] — DI, только для тестируемости (тот же приём,
 *   что `deps` в `JoinGate.jsx`).
 * @param {object} [props.deps.signaling] — форвардится в `useSignaling` как `deps`.
 * @param {object} [props.deps.mesh] — форвардится в `useMesh` как `deps`.
 * @param {object} [props.deps.media] — форвардится в `useMedia` как `deps`.
 */
function RoomScreen({ roomId, name, deps = {} }) {
  const [mediaReady, setMediaReady] = useState(false);
  const [selfId, setSelfId] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [messages, setMessages] = useState([]);
  const [joinRejected, setJoinRejected] = useState(null);
  const [connectionError, setConnectionError] = useState(null);

  /**
   * Разрывает циклическую зависимость объявлений: `useMesh`/`useMedia`
   * нуждаются в стабильной ссылке на `emit` ДО того, как ниже создан
   * `useSignaling` (которому, в свою очередь, нужны `handlers`, замыкающие
   * `mesh`/`media`). `emit` — стабильная обёртка над `emitRef.current`,
   * которую эффект ниже наполняет реальным `signaling.emit` после того, как
   * хук сигналинга создан.
   */
  const emitRef = useRef(() => {});
  const emit = useCallback((event, payload) => emitRef.current(event, payload), []);

  const mesh = useMesh({ emit, deps: deps.mesh });
  const media = useMedia({ getVideoSenders: mesh.getVideoSenders, emit, deps: deps.media });

  /**
   * `handlers` создаётся один раз (`useMemo(..., [])`) — все замыкаемые
   * зависимости стабильны на весь жизненный цикл компонента: state-сеттеры
   * (гарантия React), `mesh.ensureMesh`/`mesh.getVideoSenders` и
   * `media.getLocalStream`/`init`/`toggleAudio`/`toggleVideo` (стабильные
   * `useCallback` внутри `useMesh`/`useMedia`, см. их JSDoc).
   */
  const handlers = useMemo(
    () => ({
      /** Design §6.2 `join:ok` + §7.1 «правило инициативы». */
      onJoinOk(payload) {
        const initialParticipants = payload?.participants ?? [];
        setSelfId(payload?.selfId ?? null);
        setParticipants(initialParticipants);
        setMessages(payload?.history ?? []);
        setJoinRejected(null);

        const meshInstance = mesh.ensureMesh(payload?.iceServers);
        for (const participant of initialParticipants) {
          if (participant.id !== payload?.selfId) {
            meshInstance.addExistingParticipant(participant.id);
          }
        }

        const stream = media.getLocalStream();
        if (stream) {
          for (const track of stream.getTracks()) {
            meshInstance.attachLocalTrack(track, stream);
          }
        }
      },
      /** Design §6.2 `join:rejected { code, message }`. */
      onJoinRejected(payload) {
        setJoinRejected(payload ?? null);
      },
      /** Design §6.2/§7.1: self — старожил относительно нового пира → offer. */
      onParticipantJoined(payload) {
        setParticipants((prev) => (prev.some((p) => p.id === payload.id) ? prev : [...prev, payload]));
        mesh.ensureMesh().onParticipantJoined(payload.id);
      },
      /** Design §7.3: убрать участника + закрыть PeerConnection. */
      onParticipantLeft(payload) {
        setParticipants((prev) => prev.filter((p) => p.id !== payload.id));
        mesh.ensureMesh().onParticipantLeft(payload.id);
      },
      /** Design §7.4: чат-сообщение — текстовые узлы рендерит JSX сам (SEC-04). */
      onChatMessage(payload) {
        setMessages((prev) => [...prev, { ...payload, kind: 'chat' }]);
      },
      /** Design §6.2 `chat:system { event: 'join'|'leave', subjectName }`. */
      onChatSystem(payload) {
        setMessages((prev) => [...prev, { ...payload, kind: 'system' }]);
      },
      /** Design §6.2/§7.2: обновить mic/cam статус конкретного участника. */
      onMediaState(payload) {
        setParticipants((prev) =>
          prev.map((p) =>
            p.id === payload.id ? { ...p, media: { audio: payload.audio, video: payload.video } } : p,
          ),
        );
      },
      /** Design §7.1: входящий offer/answer/ice маршрутизируется в mesh как есть (SEC-18). */
      onSignalOffer(payload) {
        mesh.ensureMesh().handleSignal({ type: 'signal:offer', from: payload.from, sdp: payload.sdp });
      },
      onSignalAnswer(payload) {
        mesh.ensureMesh().handleSignal({ type: 'signal:answer', from: payload.from, sdp: payload.sdp });
      },
      onSignalIce(payload) {
        mesh.ensureMesh().handleSignal({ type: 'signal:ice', from: payload.from, candidate: payload.candidate });
      },
      /** US-13 «сервер недоступен» — баннер рендерит будущая задача 30, здесь только state. */
      onConnectionError(reason) {
        setConnectionError(reason ?? null);
      },
    }),
    // см. комментарий к `handlers` выше: все зависимости стабильны на весь
    // жизненный цикл компонента.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const signaling = useSignaling({ roomId, name, enabled: mediaReady, handlers, deps: deps.signaling });

  useEffect(() => {
    emitRef.current = signaling.emit;
  }, [signaling.emit]);

  /**
   * Design §7.1: «getUserMedia (audio+video по умолчанию)» — первый шаг
   * оркестрации, до сетевого входа (см. `enabled: mediaReady` выше). Отказ
   * устройств не блокирует переход дальше (Design §8, `media.init()` сам не
   * бросает — см. `mediaController.js`).
   */
  useEffect(() => {
    let cancelled = false;
    media.init().then(() => {
      if (!cancelled) {
        setMediaReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
    // запускается ровно один раз на маунт этого захода в комнату;
    // `media.init` — стабильная ссылка (см. JSDoc `useMedia.js`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="room-screen" data-testid="room-screen">
      <p>Комната: {roomId}</p>
      {joinRejected ? (
        <p role="alert">
          Не удалось войти в комнату{joinRejected.message ? `: ${joinRejected.message}` : ''}
        </p>
      ) : null}
      {connectionError ? <p role="alert">Ошибка соединения с сервером</p> : null}

      <div data-testid="video-grid">
        {participants.map((participant) => (
          <div key={participant.id} data-testid="video-tile" data-participant-id={participant.id}>
            {participant.name}
            {participant.id === selfId ? ' (я)' : ''}
            {participant.media && participant.media.audio === false ? ' 🔇' : ''}
          </div>
        ))}
      </div>

      <ul data-testid="participant-list">
        {participants.map((participant) => (
          <li key={participant.id}>{participant.name}</li>
        ))}
      </ul>

      <div data-testid="chat-panel">
        <ul>
          {messages.map((message) => (
            <li key={message.id}>
              {message.kind === 'chat' ? `${message.authorName}: ${message.text}` : `${message.subjectName} — ${message.event}`}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* eslint-enable react/prop-types */

export default RoomScreen;
