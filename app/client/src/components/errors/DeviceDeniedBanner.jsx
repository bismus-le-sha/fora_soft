/**
 * DeviceDeniedBanner.jsx — баннер отказа доступа к камере/микрофону (задача
 * 30, RESTYLE в задаче 43).
 *
 * Design §8 (Error Handling & Edge Cases), строка «Отказ в доступе к
 * камере/микрофону»: «Клиент | `getUserMedia` reject → остаётся в комнате с
 * выключенными устройствами; баннер «нет доступа»; `media:state{false}`. Не
 * «вылетает».» (F-33, US-12, SEC-21). Design §4.2, дерево `components/errors/`.
 *
 * Намеренно НЕ блокирует и не размонтирует остальной `RoomScreen` — рендерится
 * рядом с сеткой/чатом/списком (критерий приёмки задачи 30: «отказ устройств
 * → баннер, юзер в комнате»). Обобщённое сообщение без деталей ошибки
 * браузера (SEC-15) — не показываем `DOMException.message`/`name`.
 *
 * Задача 43 (RESTYLE, addendum §3): вёрстка + дословная сверка копирайта с
 * README §9, вынесенного в `DeviceDeniedBanner.content.js` (основное
 * сообщение + подсказка «как исправить»).
 *
 * Requirements: F-33, US-12, SEC-15, SEC-21. Design: §4.2, §8.
 */
import styles from './DeviceDeniedBanner.module.css';
import { DEVICE_DENIED } from './DeviceDeniedBanner.content.js';

function DeviceDeniedBanner() {
  return (
    <div role="alert" data-testid="device-denied-banner">
      <div className={styles.banner}>
        <svg
          className={styles.icon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5" />
          <circle cx="12" cy="16.5" r="0.9" fill="currentColor" stroke="none" />
        </svg>
        <p className={styles.message}>{DEVICE_DENIED.message}</p>
      </div>
      <div className={styles.fix}>
        <span className={styles.fixLabel}>{DEVICE_DENIED.fixLabel}</span>
        <span>{DEVICE_DENIED.fixHint}</span>
      </div>
    </div>
  );
}

export default DeviceDeniedBanner;
