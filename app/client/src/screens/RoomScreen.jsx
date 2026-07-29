import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSignaling } from '../hooks/useSignaling.js';
import { useMesh } from '../hooks/useMesh.js';
import { useMedia } from '../hooks/useMedia.js';
import VideoGrid from '../components/VideoGrid.jsx';
import RoomTopBar from '../components/RoomTopBar.jsx';
import ChatSidePanel from '../components/ChatSidePanel.jsx';
import ExitConfirmModal from '../components/ExitConfirmModal.jsx';
import RoomFullBanner from '../components/errors/RoomFullBanner.jsx';
import DeviceDeniedBanner from '../components/errors/DeviceDeniedBanner.jsx';
import ServerDownBanner from '../components/errors/ServerDownBanner.jsx';
import PermissionPrep from './PermissionPrep.jsx';
import styles from './RoomScreen.module.css';

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
 * Design §7.1 (sequence «Вход и установка mesh»): порядок — инициализация
 * сохранённого состояния устройств → `join {roomId, name}` → (для старожилов) `signal:offer` →
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
 * реально показывают видео/играют звук, а не только заглушку-силуэт. Задача
 * 39 (Сцена + Лента, design addendum §3/§5.1) дополнительно получает
 * `roomUrl` — тот же URL, что «Скопировать ссылку» в `RoomTopBar`, нужен
 * карточке приглашения при 1 участнике (README §4).
 * `RoomTopBar` (задача 38, замена `ControlBar.jsx` задачи 27) подключена ниже
 * — тумблеры mic/cam вызывают `media.toggleAudio`/`media.toggleVideo` (сами
 * эмитят `media:state`, Design §7.2, см. JSDoc `useMedia.js`), «Копировать
 * ссылку» получает `roomUrl` в формате `${window.location.origin}/room/${roomId}`
 * (тот же маршрут, что разбирает `App.jsx` `ROOM_PATH`). «Выйти» БОЛЬШЕ НЕ
 * эмитит `leave` напрямую (критерий приёмки задачи 38) — вызывает
 * `handleRequestLeave`, который открывает `isExitConfirmOpen`; задача 42
 * рендерит по нему полноценную `ExitConfirmModal.jsx` (README §7) ниже —
 * только подтверждение внутри неё реально эмитит `leave`, сразу после чего
 * вызывается `props.onLeave` (баг-фикс задачи 42 — до него ничего не
 * возвращало пользователя на стартовый экран после выхода; см. JSDoc
 * `onLeave` у сигнатуры компонента и `App.jsx.handleRoomLeave`).
 * `ParticipantList` (задача 29) и `ChatPanel` (задача 28) с задачи 41 больше
 * НЕ рендерятся напрямую здесь — они объединены в `ChatSidePanel.jsx`
 * (design addendum §3/§5.4, RESTRUCTURE): одна сворачиваемая панель с табами
 * «Чат»/«Участники» вместо двух всегда видимых блоков. `RoomScreen` владеет
 * единым состоянием панели (`isChatOpen`/`chatActiveTab`) — оно нужно сразу
 * трём потребителям: `RoomTopBar` (подсветка кнопки «Чат»/бейдж), `VideoGrid`
 * (сжатие Ленты, задача 39) и самой `ChatSidePanel` (что рендерить/какой таб
 * активен). `unreadCount` — тоже здесь: инкремент на `onChatMessage`/
 * `onChatSystem` ниже, пока панель закрыта или открыта не на вкладке «Чат»,
 * сброс эффектом при `isChatOpen && chatActiveTab === 'chat'` (addendum
 * §5.4). `onSend` эмитит `chat:send {text}` тем же `emit`, что и остальные
 * исходящие события (Design §7.4); `messages`/`selfId`/`participants` — тот
 * же React state, что уже наполняли обработчики выше.
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
 * @param {() => void} [props.onLeave] — задача 42 (баг-фикс): вызывается сразу
 *   после реального `emit('leave')` в `handleConfirmLeave` — владелец
 *   маршрута (`App.jsx`) переключает URL обратно на `/` (см. его JSDoc).
 *   `RoomScreen` сам не знает о роутинге (Design §4.2 — это забота `App.jsx`).
 * @param {object} [props.deps] — DI, только для тестируемости (тот же приём,
 *   что `deps` в `JoinGate.jsx`).
 * @param {object} [props.deps.signaling] — форвардится в `useSignaling` как `deps`.
 * @param {object} [props.deps.mesh] — форвардится в `useMesh` как `deps`.
 * @param {object} [props.deps.media] — форвардится в `useMedia` как `deps`.
 */
function RoomScreen({
  roomId,
  name,
  initialMediaState = { audio: false, video: false },
  onJoined,
  onMediaStateChange,
  onLeave,
  deps = {},
}) {
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
   * больше не эмитит его напрямую. Задача 42 рендерит по этому флагу
   * `ExitConfirmModal.jsx` (README §7), контракт колбэков
   * (`handleRequestLeave`/`handleStay`/`handleConfirmLeave`) не менялся.
   */
  const [isExitConfirmOpen, setIsExitConfirmOpen] = useState(false);

  /**
   * Задача 41 (addendum §5.4): единое состояние сворачиваемой панели
   * Чат/Участники — источник истины для `RoomTopBar`/`VideoGrid`/
   * `ChatSidePanel` (см. JSDoc выше). Закрыта и на вкладке «Чат» по
   * умолчанию (README §5: «по умолчанию закрыта»).
   */
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatActiveTab, setChatActiveTab] = useState('chat');
  /** Addendum §5.4: инкремент/сброс — см. `handlers.onChatMessage/onChatSystem` и эффект ниже. */
  const [unreadCount, setUnreadCount] = useState(0);

  /**
   * `handlers` ниже создаётся один раз (`useMemo(..., [])`, см. его
   * собственный JSDoc) — чтобы инкремент непрочитанных видел АКТУАЛЬные
   * `isChatOpen`/`chatActiveTab`, а не значения на момент создания
   * замыкания, состояние дублируется в refs, обновляемые эффектами ниже.
   */
  const isChatOpenRef = useRef(isChatOpen);
  const chatActiveTabRef = useRef(chatActiveTab);
  useEffect(() => {
    isChatOpenRef.current = isChatOpen;
  }, [isChatOpen]);
  useEffect(() => {
    chatActiveTabRef.current = chatActiveTab;
  }, [chatActiveTab]);

  /** Addendum §5.4: «сброс при открытии на неё [вкладку «Чат»]». */
  useEffect(() => {
    if (isChatOpen && chatActiveTab === 'chat') {
      setUnreadCount(0);
    }
  }, [isChatOpen, chatActiveTab]);

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
  const hasJoinedRef = useRef(false);
  const attachNewLocalTrack = useCallback(
    (track, stream) => {
      if (hasJoinedRef.current) {
        mesh.ensureMesh().attachLocalTrack(track, stream);
      }
    },
    [mesh],
  );
  const media = useMedia({
    getVideoSenders: mesh.getVideoSenders,
    onLocalTrackAdded: attachNewLocalTrack,
    emit,
    deps: deps.media,
  });
  const mediaStateRef = useRef(media.mediaState);
  mediaStateRef.current = media.mediaState;

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
        hasJoinedRef.current = true;
        const initialParticipants = payload?.participants ?? [];
        setSelfId(payload?.selfId ?? null);
        setParticipants(initialParticipants);
        setMessages(payload?.history ?? []);
        setJoinRejected(null);
        setJoinedAt(Date.now());
        onJoined?.(roomId, name, mediaStateRef.current);

        const meshInstance = mesh.ensureMesh(payload?.iceServers);
        const stream = media.getLocalStream();
        if (stream) {
          for (const track of stream.getTracks()) {
            meshInstance.attachLocalTrack(track, stream);
          }
        }
        for (const participant of initialParticipants) {
          if (participant.id !== payload?.selfId) {
            meshInstance.addExistingParticipant(participant.id);
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
      /**
       * Design §7.4: чат-сообщение — текстовые узлы рендерит JSX сам (SEC-04).
       * Addendum §5.4: инкремент `unreadCount`, пока панель закрыта или
       * открыта не на вкладке «Чат» (актуальные значения — через refs, см.
       * их JSDoc выше, `handlers` создаётся один раз).
       */
      onChatMessage(payload) {
        setMessages((prev) => [...prev, { ...payload, kind: 'chat' }]);
        if (!(isChatOpenRef.current && chatActiveTabRef.current === 'chat')) {
          setUnreadCount((prev) => prev + 1);
        }
      },
      /** Design §6.2 `chat:system { event: 'join'|'leave', subjectName }`; addendum §5.4 — тот же инкремент, что onChatMessage. */
      onChatSystem(payload) {
        setMessages((prev) => [...prev, { ...payload, kind: 'system' }]);
        if (!(isChatOpenRef.current && chatActiveTabRef.current === 'chat')) {
          setUnreadCount((prev) => prev + 1);
        }
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
   * Инициализация сохранённого выбора устройств — первый шаг
   * оркестрации, до сетевого входа (см. `enabled: mediaReady` выше). Отказ
   * устройств не блокирует переход дальше (Design §8, `media.init()` сам не
   * бросает — см. `mediaController.js`).
   */
  useEffect(() => {
    let cancelled = false;
    media.init(initialMediaState).then(() => {
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

  useEffect(() => {
    if (mediaReady) {
      onMediaStateChange?.(roomId, media.mediaState);
    }
  }, [mediaReady, media.mediaState, onMediaStateChange, roomId]);

  /**
   * US-3/US-10 «Копировать ссылку»: тот же маршрут, что разбирает `App.jsx`
   * (`ROOM_PATH = /^\/room\/([^/]+)\/?$/`) — `${origin}/room/${roomId}`.
   */
  const roomUrl = useMemo(
    () => `${globalThis.location?.origin ?? ''}/room/${roomId}`,
    [roomId],
  );
  const visibleParticipants = useMemo(
    () =>
      participants.map((participant) =>
        participant.id === selfId ? { ...participant, media: media.mediaState } : participant,
      ),
    [participants, selfId, media.mediaState],
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

  /**
   * Подтверждение внутри гейта — только отсюда реально уходит `leave {}`
   * (Design §7.3). Задача 42 (баг-фикс): до этого фикса `onLeave` не
   * вызывался вовсе — `RoomScreen` эмитил `leave` на сервер, но ничего не
   * сообщало `App.jsx`, и пользователь визуально оставался на экране комнаты
   * (сервер уже вычистил его из `Room`, но клиент не знал вернуться на
   * стартовый экран). `onLeave?.()` — единственное место, что сообщает
   * наверх «выход подтверждён» (см. JSDoc `onLeave` выше).
   */
  const handleConfirmLeave = useCallback(() => {
    setIsExitConfirmOpen(false);
    emit('leave');
    onLeave?.();
  }, [emit, onLeave]);

  /**
   * Задача 41 (addendum §5.4): кнопка «Чат» в `RoomTopBar` — единственный
   * способ открыть панель (README §5), поэтому открытие всегда возвращает
   * активный таб на «Чат» (закрытие тут ни на что не влияет — контент
   * панели скрыт, см. JSDoc `ChatSidePanel.jsx`).
   */
  const handleToggleChat = useCallback(() => {
    setIsChatOpen((prevOpen) => !prevOpen);
    setChatActiveTab('chat');
  }, []);

  /** Клик по табу внутри уже открытой панели. */
  const handleChatTabChange = useCallback((tab) => {
    setChatActiveTab(tab);
  }, []);

  /** Кнопка-крестик в шапке панели — закрывает, не трогая выбранный таб. */
  const handleChatClose = useCallback(() => {
    setIsChatOpen(false);
  }, []);

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

  if (joinRejected?.code === 'room-full') {
    return (
      <main className={styles.joinErrorScreen} data-testid="room-full-screen">
        <RoomFullBanner onRetry={handleRetryJoin} />
      </main>
    );
  }

  return (
    <div className={styles.roomScreen} data-testid="room-screen">
      {joinRejected ? <p role="alert">Не удалось войти в комнату.</p> : null}
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
        unreadCount={unreadCount}
        isChatOpen={isChatOpen}
        onToggleChat={handleToggleChat}
        onRequestLeave={handleRequestLeave}
      />

      <div className={styles.content}>
        <VideoGrid
          participants={visibleParticipants}
          selfId={selfId}
          localStream={media.localStream}
          remoteStreams={mesh.remoteStreams}
          roomUrl={roomUrl}
          isChatOpen={isChatOpen}
          selfDeviceDenied={media.deviceDenied}
        />

        <ChatSidePanel
          isOpen={isChatOpen}
          activeTab={chatActiveTab}
          onTabChange={handleChatTabChange}
          onClose={handleChatClose}
          messages={messages}
          selfId={selfId}
          onSend={(text) => emit('chat:send', { text })}
          participants={visibleParticipants}
        />
      </div>

      {isExitConfirmOpen ? (
        <ExitConfirmModal onStay={handleStay} onConfirmLeave={handleConfirmLeave} />
      ) : null}
    </div>
  );
}

/* eslint-enable react/prop-types */

export default RoomScreen;
