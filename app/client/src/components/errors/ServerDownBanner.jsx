/**
 * ServerDownBanner.jsx — баннер недоступности сигнального сервера (задача 30,
 * RESTYLE в задаче 43).
 *
 * Design §8 (Error Handling & Edge Cases), строка «Сигнальный сервер
 * недоступен»: «Клиент | `connect_error`/timeout socket.io → баннер «Ошибка
 * сервера»; без белого экрана.» (F-35, US-13). Design §4.2, `signalingClient.js`
 * JSDoc: «реэмиссия ошибок соединения… баннер рендерится… задачей 30».
 *
 * Обобщённое сообщение (SEC-15) — не показываем причину/код сетевой ошибки
 * (`reason.message`), только факт недоступности сервера.
 *
 * Задача 43 (RESTYLE, addendum §3): вёрстка + дословная сверка копирайта с
 * README §9, вынесенного в `ServerDownBanner.content.js`. README §9 «UI»-
 * колонка для этого состояния также описывает кнопку «Попробовать сейчас» и
 * mono-строку «попытка N · через M с» — в «Копирайт»-колонке (источник
 * дословного текста, который сверяет задача 43) их нет, а сам компонент не
 * получает и не получал (задача 30) ни `onRetry`, ни данные о попытках
 * переподключения. Design addendum §3 явно ограничивает задачу 43 вёрсткой
 * уже существующей логики, не добавлением новой — счётчик попыток
 * потребовал бы нового клиентского состояния (подписка на
 * `reconnect_attempt` socket.io), что вне скоупа RESTYLE; сознательно не
 * реализовано в этом заходе.
 *
 * Requirements: F-35, US-13, SEC-15. Design: §4.2, §8.
 */
import styles from './ServerDownBanner.module.css';
import { SERVER_DOWN } from './ServerDownBanner.content.js';

function ServerDownBanner() {
  return (
    <div className={styles.wrapper} role="alert" data-testid="server-down-banner">
      <div className={styles.stack}>
        <span className={styles.dots} aria-hidden="true">
          <span className={styles.dot} />
          <span className={styles.dot} />
          <span className={styles.dot} />
        </span>
        <h2 className={styles.title}>{SERVER_DOWN.title}</h2>
        <p className={styles.description}>{SERVER_DOWN.description}</p>
      </div>
    </div>
  );
}

export default ServerDownBanner;
