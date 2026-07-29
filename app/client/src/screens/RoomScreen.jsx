import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSignaling } from '../hooks/useSignaling.js';
import { useMesh } from '../hooks/useMesh.js';
import { useMedia } from '../hooks/useMedia.js';
import VideoGrid from '../components/VideoGrid.jsx';
import RoomTopBar from '../components/RoomTopBar.jsx';
import ParticipantList from '../components/ParticipantList.jsx';
import ChatPanel from '../components/ChatPanel.jsx';
import RoomFullBanner from '../components/errors/RoomFullBanner.jsx';
import DeviceDeniedBanner from '../components/errors/DeviceDeniedBanner.jsx';
import ServerDownBanner from '../components/errors/ServerDownBanner.jsx';
import PermissionPrep from './PermissionPrep.jsx';

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
 * `VideoGrid` (задача 25) уже выделена в `components/VideoGrid.jsx`; с задачи
 * 31 получает `localStream={media.localStream}`/`remoteStreams={mesh.remoteStreams}`
 * (ранее отложенная проводка, см. отчёт code-review задачи 26) — так плитки
 * реально показывают видео/играют звук, а не только заглушку-силуэт.
 * `RoomTopBar` (задача 38, замена `ControlBar.jsx` задачи 27) подключена ниже
 * — тумблеры mic/cam вызывают `media.toggleAudio`/`media.toggleVideo` (сами
 * эмитят `media:state`, Design §7.2, см. JSDoc `useMedia.js`), «Копировать
 * ссылку» получает `roomUrl` в формате `${window.location.origin}/room/${roomId}`
 * (тот же маршрут, что разбирает `App.jsx` `ROOM_PATH`). «Выйти» БОЛЬШЕ НЕ
 * эмитит `leave` напрямую (критерий приёмки задачи 38) — вызывает
 * `handleRequestLeave`, который открывает `isExitConfirmOpen` (временный
 * неоформленный гейт подтверждения ниже, пока задача 42 не подключит
 * полноценную `ExitConfirmModal.jsx`, README §7); только подтверждение внутри
 * него реально эмитит `leave`.
 * `ParticipantList` (задача 29) подключена ниже — рендерит `participants` тем
 * же React state, что обновляют `onParticipantJoined`/`onParticipantLeft`/
 * `onMediaState` выше (F-16, US-9, Design §6.2), сам по себе презентационный
 * (тот же приём, что `VideoGrid`/`ControlBar`, задачи 25/27).
 * `ChatPanel` (задача 28, `components/ChatPanel.jsx`) подключена ниже (задача
 * 32 — во время подготовки сквозного E2E-потока обнаружено и закрыто: до
 * этого здесь оставалась инлайн-разметка вместо реального компонента, без
 * поля ввода — отправить сообщение через UI было нельзя). `onSend` эмитит
 * `chat:send {text}` тем же `emit`, что и остальные исходящие события
 * (Design §7.4); `messages`/`selfId` — тот же React state, что уже наполняли
 * обработчики выше.
 *
 * Баннеры ошибок и состояний (задача 30, Design §8): `join:rejected{room-full}`
 * → `RoomFullBanner` с кнопкой «Повторить вход» (`handleRetryJoin` повторно
 * эмитит `join` тем же сокетом); `getUserMedia` reject (`useMedia().deviceDenied`,
 * см. `mediaController.js`/`useMedia.js`) → `DeviceDeniedBanner`, пользователь
 * остаётся в комнате; `connect_error`/timeout сокета (`onConnectionError`) →
 * `ServerDownBanner`. `NoWebRtcBanner` (браузер без WebRTC) — preflight в
 * `App.jsx`, не в `RoomScreen` (задача 17, вне скоупа задачи 30).
 *
 * Requirements: F-07, F-16, F-33, F-35, F-36, US-5, US-6, US-9, US-12, US-13,
 * SEC-15. Design: §4.2, §5.3, §7.1, §8.
 *
 * Задача 37: пока первый `media.init()` ещё ждёт ответ браузера, вместо тихого
 * пустого ожидания рендерится `PermissionPrep` (design-handoff README §3).
 * После resolve/reject `mediaReady` становится `true`, экран скрывается, и
 * существующий поток входа продолжает работу без изменения socket-контракта.
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
  /** Addendum §5.3: момент успешного `join:ok`, старт таймера звонка `RoomTopBar`. */
  const [joinedAt, setJoinedAt] = useState(null);
  /**
   * Задача 38 (критерий приёмки): гейт перед реальным `leave` — «Выйти»
   * больше не эмитит его напрямую. Задача 42 заменит временный блок ниже на
   * полноценную `ExitConfirmModal.jsx` (README §7), не меняя этот контракт
   * (`isExitConfirmOpen`/`handleRequestLeave`/`handleStay`/`handleConfirmLeave`).
   */
  const [isExitConfirmOpen, setIsExitConfirmOpen] = useState(false);

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
        setJoinedAt(Date.now());

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
      /**
       * US-13 «сервер недоступен» — `ServerDownBanner` (задача 30, Design §8
       * «Сигнальный сервер недоступен»). `reason` (объект `Error` от
       * `connect_error`) намеренно не показывается пользователю (SEC-15) —
       * только факт state-флага ниже.
       */
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

  /**
   * US-3/US-10 «Копировать ссылку»: тот же маршрут, что разбирает `App.jsx`
   * (`ROOM_PATH = /^\/room\/([^/]+)\/?$/`) — `${origin}/room/${roomId}`.
   */
  const roomUrl = useMemo(
    () => `${globalThis.location?.origin ?? ''}/room/${roomId}`,
    [roomId],
  );

  /**
   * Задача 38 (критерий приёмки): клик «Выйти» в шапке открывает гейт
   * подтверждения, НЕ эмитит `leave` напрямую (Design §7.3 `leave {}` —
   * реально эмитится только из `handleConfirmLeave` ниже).
   */
  const handleRequestLeave = useCallback(() => {
    setIsExitConfirmOpen(true);
  }, []);

  /** Закрыть гейт без выхода («Остаться»). */
  const handleStay = useCallback(() => {
    setIsExitConfirmOpen(false);
  }, []);

  /** Подтверждение внутри гейта — только отсюда реально уходит `leave {}` (Design §7.3). */
  const handleConfirmLeave = useCallback(() => {
    setIsExitConfirmOpen(false);
    emit('leave');
  }, [emit]);

  /**
   * Задача 30, критерий приёмки: кнопка «Повторить вход» (`RoomFullBanner`)
   * даёт пользователю повторить попытку присоединения. Design §8 «Комната
   * заполнена»: сервер отклоняет `join` только если `socket.data.roomId`
   * уже установлен предыдущим УСПЕШНЫМ входом — после `room-full` он не
   * установлен, поэтому тот же сокет может повторно эмитить `join` тем же
   * `{roomId, name}` без переподключения/повторного `getUserMedia`.
   */
  const handleRetryJoin = useCallback(() => {
    setJoinRejected(null);
    emit('join', { roomId, name });
  }, [emit, roomId, name]);

  if (!mediaReady) {
    return <PermissionPrep />;
  }

  return (
    <div className="room-screen" data-testid="room-screen">
      <p>Комната: {roomId}</p>
      {joinRejected?.code === 'room-full' ? (
        <RoomFullBanner onRetry={handleRetryJoin} />
      ) : joinRejected ? (
        <p role="alert">Не удалось войти в комнату.</p>
      ) : null}
      {connectionError ? <ServerDownBanner /> : null}
      {media.deviceDenied ? <DeviceDeniedBanner /> : null}

      <RoomTopBar
        roomId={roomId}
        joinedAt={joinedAt}
        mediaState={media.mediaState}
        onToggleAudio={media.toggleAudio}
        onToggleVideo={media.toggleVideo}
        roomUrl={roomUrl}
        participantCount={participants.length}
        onRequestLeave={handleRequestLeave}
      />

      <VideoGrid
        participants={participants}
        selfId={selfId}
        localStream={media.localStream}
        remoteStreams={mesh.remoteStreams}
      />

      <ParticipantList participants={participants} selfId={selfId} />

      <ChatPanel
        messages={messages}
        selfId={selfId}
        onSend={(text) => emit('chat:send', { text })}
      />

      {/*
       * Задача 38 — временный неоформленный гейт подтверждения выхода (см.
       * JSDoc `isExitConfirmOpen` выше). Задача 42 заменит это на
       * `ExitConfirmModal.jsx` (README §7: карточка, «Остаться»/«Выйти»,
       * нейтральный тон) — контракт колбэков (`handleStay`/`handleConfirmLeave`)
       * не изменится.
       */}
      {isExitConfirmOpen ? (
        <div role="dialog" aria-modal="true" data-testid="exit-confirm">
          <p>Выйти из комнаты?</p>
          <button type="button" data-testid="exit-confirm-stay" onClick={handleStay}>
            Остаться
          </button>
          <button type="button" data-testid="exit-confirm-leave" onClick={handleConfirmLeave}>
            Выйти
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* eslint-enable react/prop-types */

export default RoomScreen;
