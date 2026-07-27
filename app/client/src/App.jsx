import { useCallback, useEffect, useState } from 'react';
import { checkWebrtcSupport } from './lib/compat.js';
import { generateRoomId } from './lib/roomId.js';
import NoWebRtcBanner from './components/errors/NoWebRtcBanner.jsx';
import StartScreen from './screens/StartScreen.jsx';
import JoinGate from './screens/JoinGate.jsx';
import RoomScreen from './screens/RoomScreen.jsx';

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
 * `/room/:roomId` рендерит `JoinGate` (задача 20) — экран запроса имени +
 * первичный `getUserMedia` по клику «Войти» (user-gesture, F-37). После
 * успешного `onJoin(name)` рендерится `RoomScreen` (задача 24) — полноценная
 * оркестрация media → mesh → signaling.
 */

/** Design §6.4: `/room/:roomId` — извлечение `roomId` из пути. */
const ROOM_PATH = /^\/room\/([^/]+)\/?$/;

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
  /** Имя, введённое в `JoinGate` — прокидывается в `RoomScreen` (Design §7.1). */
  const [joinedName, setJoinedName] = useState(null);

  useEffect(() => {
    function handlePopState() {
      setPathname(globalThis.location.pathname);
      // Навигация назад/вперёд покидает текущий вход в комнату — сброс
      // `joinedName` гарантирует, что повторный заход на `/room/:id`
      // снова начинается с JoinGate, а не «протухшего» RoomScreen.
      setJoinedName(null);
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
  const handleCreate = useCallback((_name) => {
    const roomId = generateRoomId();
    const nextPath = `/room/${roomId}`;
    globalThis.history.pushState(null, '', nextPath);
    setPathname(nextPath);
  }, []);

  /**
   * Design §4.2/§7.1: `JoinGate.onJoin(name)` сигнализирует, что первичный
   * `getUserMedia` отработан (успешно или нет — JoinGate сама не роняет
   * приложение, Design §8) и пользователь готов войти. Сохраняем имя в
   * state — это переключает рендер с `JoinGate` на `RoomScreen`, который
   * берёт на себя собственно вход в комнату по сети (`join {roomId, name}`)
   * и дальнейшую оркестрацию media → mesh → signaling (задача 24).
   */
  const handleJoin = useCallback((joinName) => {
    setJoinedName(joinName);
  }, []);

  if (!supported) {
    return <NoWebRtcBanner />;
  }

  const roomMatch = ROOM_PATH.exec(pathname);

  return (
    <div id="app">
      {roomMatch ? (
        joinedName === null ? (
          <JoinGate roomId={roomMatch[1]} onJoin={handleJoin} />
        ) : (
          <RoomScreen roomId={roomMatch[1]} name={joinedName} deps={deps.room} />
        )
      ) : (
        <StartScreen onCreate={handleCreate} />
      )}
    </div>
  );
}

/* eslint-enable react/prop-types */

export default App;
