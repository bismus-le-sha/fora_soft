import { useCallback, useEffect, useState } from 'react';
import { checkWebrtcSupport } from './lib/compat.js';
import { generateRoomId } from './lib/roomId.js';
import { validateParticipantName } from './lib/nameValidation.js';
import NoWebRtcBanner from './components/errors/NoWebRtcBanner.jsx';
import StartScreen from './screens/StartScreen.jsx';
import JoinGate from './screens/JoinGate.jsx';
import RoomScreen from './screens/RoomScreen.jsx';
import MediaRejoinPrompt from './components/MediaRejoinPrompt.jsx';

/**
 * Design §4.2: `App.jsx` — «Маршрут Start/Room по URL; preflight-проверка
 * окружения (WebRTC/secure context, F-36); отображение фатальных баннеров».
 *
 * Preflight-гейт (задача 17): если окружение не поддерживает WebRTC —
 * рендерится фатальный `NoWebRtcBanner`, и ничего дальше (в т.ч. комната)
 * не грузится (US-13, Design §8 «Браузер без WebRTC»). Проверка выполняется
 * синхронно при рендере — без побочных эффектов и без `getUserMedia()`-
 * запроса устройств (это отдельный шаг в `mediaController.js`, задача 21).
 *
 * Маршрутизация Start ↔ Room (задача 19, §6.4/§7.1): лёгкий self-made роутинг
 * поверх History API — без роутинг-библиотеки (в проекте её нет, дух проекта —
 * минимум прод-зависимостей, Design §3.2/§10.5 SEC-19). Поддерживаемые пути:
 * `/` → StartScreen, `/room/:roomId` → комната. Любой прочий путь трактуется
 * как StartScreen (нет отдельного 404-экрана — вне скоупа задачи 19).
 *
 * `/room/:roomId` рендерит `JoinGate` (задача 20) — экран запроса имени.
 * Устройства здесь не захватываются: комната стартует с mic/cam off. После
 * успешного `onJoin(name)` рендерится `RoomScreen` (задача 24) — полноценная
 * оркестрация media → mesh → signaling. Подтверждённый выход
 * (`ExitConfirmModal.jsx`, задача 42) вызывает `RoomScreen.onLeave` →
 * `handleRoomLeave` ниже — та же навигация обратно на `/`, что и создание
 * комнаты (`handleCreate`), в обратную сторону.
 */

/** Design §6.4: `/room/:roomId` — извлечение `roomId` из пути. */
const ROOM_PATH = /^\/room\/([^/]+)\/?$/;
const ROOM_SESSION_KEY = 'video-chat-room:active-session';
const MEDIA_OFF = { audio: false, video: false };

function normalizeMediaState(media) {
  return {
    audio: media?.audio === true,
    video: media?.video === true,
  };
}

function readRoomSession(pathname) {
  const roomMatch = ROOM_PATH.exec(pathname);
  if (!roomMatch) {
    return null;
  }

  try {
    const stored = JSON.parse(globalThis.sessionStorage?.getItem(ROOM_SESSION_KEY) ?? 'null');
    if (stored?.roomId !== roomMatch[1]) {
      return null;
    }
    const validation = validateParticipantName(stored.name);
    return validation.ok
      ? {
          roomId: roomMatch[1],
          name: validation.value,
          media: normalizeMediaState(stored.media),
        }
      : null;
  } catch {
    return null;
  }
}

function rememberRoomSession(roomId, name, media = MEDIA_OFF) {
  try {
    globalThis.sessionStorage?.setItem(
      ROOM_SESSION_KEY,
      JSON.stringify({ roomId, name, media: normalizeMediaState(media) }),
    );
  } catch {
    // Storage may be unavailable in privacy-restricted browser contexts.
  }
}

function forgetRoomSession() {
  try {
    globalThis.sessionStorage?.removeItem(ROOM_SESSION_KEY);
  } catch {
    // Storage may be unavailable in privacy-restricted browser contexts.
  }
}

/* eslint-disable react/prop-types -- проект типизирует пропсы JSDoc-аннотациями
   (см. JoinGate.jsx/StartScreen.jsx), PropTypes не подключена (Design §3.2/§10.5 SEC-19). */

/**
 * @param {object} [props]
 * @param {object} [props.deps] — DI для `RoomScreen` (только тестируемость,
 *   тот же приём, что `deps` в `JoinGate.jsx`/`RoomScreen.jsx`); по умолчанию
 *   `RoomScreen` использует реальные `signalingClient`/`MeshManager`/
 *   `mediaController`.
 * @param {object} [props.deps.room] — форвардится в `RoomScreen` как `deps`.
 */
function App({ deps = {} } = {}) {
  const { supported } = checkWebrtcSupport();

  const [pathname, setPathname] = useState(
    () => globalThis.location?.pathname ?? '/',
  );
  const [initialSession] = useState(() =>
    readRoomSession(globalThis.location?.pathname ?? '/'),
  );
  /** Имя, введённое в `JoinGate` — прокидывается в `RoomScreen` (Design §7.1). */
  const [joinedName, setJoinedName] = useState(initialSession?.name ?? null);
  const [savedMediaState, setSavedMediaState] = useState(initialSession?.media ?? MEDIA_OFF);
  const [needsMediaChoice, setNeedsMediaChoice] = useState(initialSession !== null);

  useEffect(() => {
    function handlePopState() {
      const nextPathname = globalThis.location.pathname;
      const session = readRoomSession(nextPathname);
      setPathname(nextPathname);
      setJoinedName(session?.name ?? null);
      setSavedMediaState(session?.media ?? MEDIA_OFF);
      setNeedsMediaChoice(session !== null);
    }
    globalThis.addEventListener('popstate', handlePopState);
    return () => globalThis.removeEventListener('popstate', handlePopState);
  }, []);

  /**
   * Design §6.4: «Создание комнаты на StartScreen генерирует
   * `roomId = crypto.randomUUID()` (SEC-14) и делает `navigate(/room/:roomId)`».
   * Навигация — `history.pushState` (без полной перезагрузки страницы), с
   * ручным обновлением состояния (pushState сам по себе не эмитит `popstate`).
   *
   * `name` (props контракт `onCreate(name)`, Design §4.2) здесь намеренно не
   * используется: перенос имени на экран комнаты — часть JoinGate (задача 20),
   * вне скоупа задачи 19.
   */
  const handleCreate = useCallback((name) => {
    const roomId = generateRoomId();
    const nextPath = `/room/${roomId}`;
    globalThis.history.pushState(null, '', nextPath);
    setPathname(nextPath);
    setJoinedName(name);
    setSavedMediaState(MEDIA_OFF);
    setNeedsMediaChoice(false);
  }, []);

  /**
   * Design §4.2/§7.1: `JoinGate.onJoin(name)` сигнализирует, что имя
   * подтверждено и пользователь готов войти без захвата устройств. Сохраняем имя в
   * state — это переключает рендер с `JoinGate` на `RoomScreen`, который
   * берёт на себя собственно вход в комнату по сети (`join {roomId, name}`)
   * и дальнейшую оркестрацию media → mesh → signaling (задача 24).
   */
  const handleJoin = useCallback((joinName) => {
    setJoinedName(joinName);
    setSavedMediaState(MEDIA_OFF);
    setNeedsMediaChoice(false);
  }, []);

  /** Сессия становится восстанавливаемой только после подтверждённого `join:ok`. */
  const handleRoomJoined = useCallback((roomId, name, mediaState) => {
    const normalized = normalizeMediaState(mediaState);
    setSavedMediaState(normalized);
    rememberRoomSession(roomId, name, normalized);
  }, []);

  const handleMediaStateChange = useCallback((roomId, mediaState) => {
    const normalized = normalizeMediaState(mediaState);
    setSavedMediaState(normalized);
    const session = readRoomSession(globalThis.location?.pathname ?? '/');
    if (session?.roomId === roomId) {
      rememberRoomSession(roomId, session.name, normalized);
    }
  }, []);

  /**
   * Задача 42 (баг-фикс): подтверждённый выход из `ExitConfirmModal`
   * (`RoomScreen.onLeave`, вызывается сразу после реального `emit('leave')`)
   * должен вернуть на стартовый экран (README §7: «После выхода — возврат на
   * стартовый экран ввода имени»). До этого фикса `RoomScreen` эмитил `leave`
   * на сервер, но никак не сообщал `App.jsx` — пользователь визуально
   * оставался на экране комнаты. Тот же приём навигации, что `handleCreate`
   * выше (`pushState` + ручной `setPathname`, без `popstate`), плюс сброс
   * `joinedName` — повторный заход на ту же `/room/:id` (например, по кнопке
   * «Назад» браузера или новой ссылке) снова начинается с `JoinGate`, а не
   * с «протухшего» `RoomScreen`.
   */
  const handleRoomLeave = useCallback(() => {
    forgetRoomSession();
    globalThis.history.pushState(null, '', '/');
    setPathname('/');
    setJoinedName(null);
    setSavedMediaState(MEDIA_OFF);
    setNeedsMediaChoice(false);
  }, []);

  if (!supported) {
    return <NoWebRtcBanner />;
  }

  const roomMatch = ROOM_PATH.exec(pathname);

  return (
    <div id="app">
      {roomMatch ? (
        joinedName === null ? (
          <JoinGate onJoin={handleJoin} />
        ) : needsMediaChoice ? (
          <MediaRejoinPrompt
            initialMediaState={savedMediaState}
            onContinue={(mediaState) => {
              const normalized = normalizeMediaState(mediaState);
              setSavedMediaState(normalized);
              rememberRoomSession(roomMatch[1], joinedName, normalized);
              setNeedsMediaChoice(false);
            }}
          />
        ) : (
          <RoomScreen
            roomId={roomMatch[1]}
            name={joinedName}
            initialMediaState={savedMediaState}
            onJoined={handleRoomJoined}
            onMediaStateChange={handleMediaStateChange}
            onLeave={handleRoomLeave}
            deps={deps.room}
          />
        )
      ) : (
        <StartScreen onCreate={handleCreate} />
      )}
    </div>
  );
}

/* eslint-enable react/prop-types */

export default App;
