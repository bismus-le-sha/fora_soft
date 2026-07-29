/**
 * Фатальный экран «WebRTC не поддерживается» (F-36, US-13), RESTYLE в задаче 43.
 *
 * Design §4.2/§8, дерево `components/errors/` (соседи RoomFull/DeviceDenied/
 * ServerDown — задача 30, вне скоупа задачи 17). Рендерится вместо всего
 * приложения: preflight в `App.jsx` не пускает пользователя дальше этого
 * экрана, комната не грузится (критерий приёмки задачи 17).
 *
 * Текст — только текстовыми узлами (SEC-04, defense-in-depth; здесь нет
 * пользовательского ввода, но паттерн единый для всего клиента).
 *
 * Задача 43 (RESTYLE, addendum §3): вёрстка + дословная сверка копирайта с
 * README §9, вынесенного в `NoWebRtcBanner.content.js`. README §9 «UI»-
 * колонка также описывает три mono-пилюли версий браузеров и поле со ссылкой
 * для копирования — в «Копирайт»-колонке (источник дословного текста,
 * который сверяет задача 43) их нет; сознательно не реализованы в этом
 * заходе (потребовали бы новой логики определения версии браузера и
 * clipboard-интеграции, вне скоупа RESTYLE).
 */
import styles from './NoWebRtcBanner.module.css';
import { NO_WEBRTC } from './NoWebRtcBanner.content.js';

function NoWebRtcBanner() {
  return (
    <div className={styles.wrapper} role="alert" data-testid="no-webrtc-banner">
      <div className={styles.card}>
        <p className={styles.eyebrow}>{NO_WEBRTC.eyebrow}</p>
        <h1 className={styles.title}>{NO_WEBRTC.title}</h1>
        <p className={styles.description}>{NO_WEBRTC.description}</p>
      </div>
    </div>
  );
}

export default NoWebRtcBanner;
