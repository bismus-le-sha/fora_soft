/**
 * RoomFullBanner.jsx — баннер «Комната заполнена» (задача 30).
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
 * Requirements: F-33, F-35, F-36, US-5, US-12, US-13, SEC-15. Design: §4.2, §8.
 */

/* eslint-disable react/prop-types -- проект типизирует пропсы JSDoc-аннотациями
   (см. ParticipantList.jsx/ChatPanel.jsx), PropTypes не подключена (Design §3.2/§10.5 SEC-19). */

/**
 * @param {object} [props]
 * @param {() => void} [props.onRetry] — обработчик клика «Повторить вход».
 */
function RoomFullBanner({ onRetry } = {}) {
  return (
    <div role="alert" data-testid="room-full-banner">
      <p>Комната заполнена</p>
      <button type="button" onClick={onRetry}>
        Повторить вход
      </button>
    </div>
  );
}

/* eslint-enable react/prop-types */

export default RoomFullBanner;
