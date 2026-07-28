/**
 * ServerDownBanner.jsx — баннер недоступности сигнального сервера (задача 30).
 *
 * Design §8 (Error Handling & Edge Cases), строка «Сигнальный сервер
 * недоступен»: «Клиент | `connect_error`/timeout socket.io → баннер «Ошибка
 * сервера»; без белого экрана.» (F-35, US-13). Design §4.2, `signalingClient.js`
 * JSDoc: «реэмиссия ошибок соединения… баннер рендерится… задачей 30».
 *
 * Обобщённое сообщение (SEC-15) — не показываем причину/код сетевой ошибки
 * (`reason.message`), только факт недоступности сервера.
 *
 * Requirements: F-35, US-13, SEC-15. Design: §4.2, §8.
 */
function ServerDownBanner() {
  return (
    <div role="alert" data-testid="server-down-banner">
      <p>Ошибка сервера. Проверьте подключение к интернету и попробуйте позже.</p>
    </div>
  );
}

export default ServerDownBanner;
