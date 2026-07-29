/**
 * RoomFullBanner.jsx — баннер «Комната заполнена» (задача 30, RESTYLE в задаче 43).
 *
 * Design §8 (Error Handling & Edge Cases), строка «Комната заполнена
 * (5-й)»: «Сервер → Клиент | `join:rejected{room-full}` → баннер «Комната
 * заполнена» + кнопка «Повторить вход»». Design §4.2, дерево
 * `components/errors/` (соседи NoWebRtcBanner — задача 17 — и
 * DeviceDeniedBanner/ServerDownBanner ниже).
 *
 * Обобщённое сообщение (SEC-15, §8 «Коды ошибок клиенту… без стек-трейсов и
 * внутренних деталей») — сервер отправляет `{code: 'room-full', message}`
 * (`RoomService.js`), но здесь намеренно рендерится собственный статический
 * текст, а не `payload.message` — баннер не обязан доверять и
 * ретранслировать текст с сервера дословно, чтобы не превратиться в канал
 * утечки будущих внутренних деталей, если формат `message` когда-нибудь
 * изменится не в соответствии с этим компонентом.
 *
 * `onRetry` — повторная попытка входа (Design §7.1/§8): вызывающая сторона
 * (`RoomScreen.jsx`) переиспользует уже установленное соединение и повторно
 * эмитит `join {roomId, name}` — если слот освободился, сервер примет
 * повторный вход тем же сокетом (сервер отклоняет `join` только если
 * `socket.data.roomId` уже установлен предыдущим УСПЕШНЫМ входом — при
 * `room-full` он не установлен).
 *
 * Задача 43 (RESTYLE, addendum §3): вёрстка + дословная сверка копирайта с
 * README §9, вынесенного в `RoomFullBanner.content.js`. README §9 «Копирайт»
 * для этого состояния включает лейблы ОБЕИХ кнопок — «Попробовать снова» /
 * «Своя комната». Вторая кнопка — обычная навигационная ссылка `<a href="/">`
 * (полная перезагрузка на стартовый экран), не новый проп/состояние: логика
 * компонентов задач 17/30 (единственный колбэк `onRetry`) не меняется, как
 * того требует критерий приёмки задачи 43.
 *
 * Requirements: F-33, F-35, F-36, US-5, US-12, US-13, SEC-15. Design: §4.2, §8.
 */
import styles from './RoomFullBanner.module.css';
import { ROOM_FULL } from './RoomFullBanner.content.js';

/* eslint-disable react/prop-types -- проект типизирует пропсы JSDoc-аннотациями
   (см. ParticipantList.jsx/ChatPanel.jsx), PropTypes не подключена (Design §3.2/§10.5 SEC-19). */

/**
 * @param {object} [props]
 * @param {() => void} [props.onRetry] — обработчик клика «Попробовать снова».
 */
function RoomFullBanner({ onRetry } = {}) {
  return (
    <div className={styles.wrapper} role="alert" data-testid="room-full-banner">
      <div className={styles.card}>
        <p className={styles.capacity} aria-hidden="true">
          {ROOM_FULL.capacityLabel}
        </p>
        <h2 className={styles.title}>{ROOM_FULL.title}</h2>
        <p className={styles.description}>{ROOM_FULL.description}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.retryButton} onClick={onRetry}>
            {ROOM_FULL.retryLabel}
          </button>
          <a className={styles.ownRoomLink} href="/">
            {ROOM_FULL.ownRoomLabel}
          </a>
        </div>
      </div>
    </div>
  );
}

/* eslint-enable react/prop-types */

export default RoomFullBanner;
