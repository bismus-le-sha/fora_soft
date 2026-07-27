import { checkWebrtcSupport } from './lib/compat.js';
import NoWebRtcBanner from './components/errors/NoWebRtcBanner.jsx';

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
 * Маршрутизация Start ↔ Room (`/`, `/room/:id`) — задачи 19/20/24, здесь
 * пока плейсхолдер `#app` для поддерживаемого окружения.
 */
function App() {
  const { supported } = checkWebrtcSupport();

  if (!supported) {
    return <NoWebRtcBanner />;
  }

  return <div id="app" />;
}

export default App;
