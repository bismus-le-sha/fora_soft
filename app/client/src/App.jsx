import { useCallback, useEffect, useState } from 'react';
import { checkWebrtcSupport } from './lib/compat.js';
import { generateRoomId } from './lib/roomId.js';
import NoWebRtcBanner from './components/errors/NoWebRtcBanner.jsx';
import StartScreen from './screens/StartScreen.jsx';

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
 * `/room/:roomId` пока рендерит временный плейсхолдер — полноценный
 * `RoomScreen` (JoinGate/участники/mesh) — задача 20/24, не эта.
 */

/** Design §6.4: `/room/:roomId` — извлечение `roomId` из пути. */
const ROOM_PATH = /^\/room\/([^/]+)\/?$/;

function App() {
  const { supported } = checkWebrtcSupport();

  const [pathname, setPathname] = useState(
    () => globalThis.location?.pathname ?? '/',
  );

  useEffect(() => {
    function handlePopState() {
      setPathname(globalThis.location.pathname);
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

  if (!supported) {
    return <NoWebRtcBanner />;
  }

  const roomMatch = ROOM_PATH.exec(pathname);

  return (
    <div id="app">
      {roomMatch ? (
        <div>Room {roomMatch[1]}</div>
      ) : (
        <StartScreen onCreate={handleCreate} />
      )}
    </div>
  );
}

export default App;
