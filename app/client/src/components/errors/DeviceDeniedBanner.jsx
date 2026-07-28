/**
 * DeviceDeniedBanner.jsx — баннер отказа доступа к камере/микрофону (задача 30).
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
 * Requirements: F-33, US-12, SEC-15, SEC-21. Design: §4.2, §8.
 */
function DeviceDeniedBanner() {
  return (
    <div role="alert" data-testid="device-denied-banner">
      <p>
        Нет доступа к камере или микрофону. Вы остаётесь в комнате без них — камеру
        и микрофон можно включить позже в настройках браузера.
      </p>
    </div>
  );
}

export default DeviceDeniedBanner;
