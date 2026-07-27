import { useState } from 'react';

/**
 * JoinGate — экран запроса имени при входе по ссылке `/room/:roomId`
 * (задача 20).
 *
 * Design §4.2 (таблица компонентов): «`JoinGate.jsx` | Экран запроса имени
 * при входе по ссылке; **кнопка входа = user-gesture** для autoplay (F-37);
 * первичный `getUserMedia`. | props: `onJoin(name)`».
 * Design §7.1 (sequence «Вход и установка mesh»): «JoinGate: ввод имени +
 * user-gesture (autoplay)» → «getUserMedia (audio+video по умолчанию)» →
 * «join { roomId, name }» — три шага одной цепочки, инициированной кликом
 * по кнопке «Войти».
 * Design §8: «Отказ в доступе к камере/микрофону» → клиент НЕ «вылетает» и
 * остаётся в комнате с выключенными устройствами (F-33, US-12, SEC-21) —
 * здесь: `getUserMedia` reject не блокирует вызов `onJoin`, только помечает
 * отказ best-effort сообщением (полная обработка отказа/восстановления —
 * `mediaController.js`, задача 21, и баннеры, задача 30 — вне скоупа).
 *
 * Requirements: F-01, F-04, F-37, US-1, US-4, US-13.
 *
 * Как и `StartScreen` (задача 19), компонент НЕ владеет сокетом/медиа-
 * состоянием самой комнаты — это `RoomScreen` (задача 24, «оркестрация:
 * media → mesh → signaling»). Здесь только: (а) UX-валидация имени
 * (источник истины — серверная `validateName`, SEC-01); (б) первичный
 * `getUserMedia`, вызванный **синхронно внутри обработчика клика** (до
 * первого `await`), чтобы засчитаться браузером как «user activation» —
 * без этого более поздний autoplay удалённого `<audio>/<video>` может быть
 * заблокирован политикой браузера (F-37); (в) вызов контрактного
 * `onJoin(name)` (Design §4.2) — фактический вход в комнату (signaling
 * `join {roomId, name}`) делает вызывающая сторона, аналогично `onCreate`
 * в `StartScreen`.
 *
 * Поток, полученный здесь, **не сохраняется** — сразу останавливается
 * (`track.stop()` на каждом треке): это лишь «прайминг» разрешения/жеста.
 * Полноценное владение локальным потоком (тумблеры mic/cam) — обязанность
 * `mediaController.js` (задача 21), который запросит поток заново на
 * `RoomScreen`. Осознанный trade-off простоты — не прокидываем `MediaStream`
 * через контракт `onJoin(name)` на две задачи вперёд.
 */

/** По прецеденту `StartScreen.jsx` (задача 19) — тот же UX-лимит имени. */
const NAME_MAX = 30;

/**
 * @param {MediaStreamConstraints} constraints
 * @returns {Promise<MediaStream>}
 */
function defaultGetUserMedia(constraints) {
  return globalThis.navigator.mediaDevices.getUserMedia(constraints);
}

/* eslint-disable react/prop-types -- проект типизирует пропсы JSDoc-аннотациями
   (см. StartScreen.jsx/signalingClient.js/compat.js), PropTypes как рантайм-
   зависимость не подключена (Design §3.2/§10.5 SEC-19). */

/**
 * @param {object} props
 * @param {string} [props.roomId] — id комнаты из URL (только для отображения, UX).
 * @param {(name: string) => void} props.onJoin — вызывается с валидным
 *   (непустым после trim) именем после первичного `getUserMedia` (Design §4.2).
 * @param {object} [props.deps]
 * @param {(constraints: MediaStreamConstraints) => Promise<MediaStream>} [props.deps.getUserMedia]
 *   — фабрика запроса медиа, только для тестируемости (тот же DI-приём, что
 *   `target` в `lib/compat.js` и `deps.io` в `signalingClient.js`); по
 *   умолчанию реальный `navigator.mediaDevices.getUserMedia`.
 */
function JoinGate({ roomId, onJoin, deps = {} }) {
  const [name, setName] = useState('');
  const [mediaDenied, setMediaDenied] = useState(false);

  const getUserMedia = deps.getUserMedia ?? defaultGetUserMedia;

  const trimmedName = name.trim();
  const isValid = trimmedName.length > 0;

  /**
   * Обработчик сабмита — сама точка user-gesture (F-37). `getUserMedia`
   * вызывается синхронно первым действием внутри обработчика (см. JSDoc
   * компонента); `await` только на самом промисе запроса устройств.
   */
  async function handleSubmit(event) {
    event.preventDefault();
    if (!isValid) {
      return;
    }

    try {
      const stream = await getUserMedia({ audio: true, video: true });
      setMediaDenied(false);
      for (const track of stream.getTracks()) {
        track.stop();
      }
    } catch {
      // Design §8 «Отказ в доступе»: не ронять приложение и не блокировать
      // вход — участник остаётся в комнате с выключенными устройствами.
      setMediaDenied(true);
    }

    onJoin(trimmedName);
  }

  return (
    <form onSubmit={handleSubmit}>
      {roomId ? <p>Комната: {roomId}</p> : null}
      <label htmlFor="join-gate-name">Имя</label>
      <input
        id="join-gate-name"
        type="text"
        value={name}
        maxLength={NAME_MAX}
        autoComplete="name"
        placeholder="Введите имя"
        onChange={(event) => setName(event.target.value)}
      />
      <button type="submit" disabled={!isValid}>
        Войти
      </button>
      {mediaDenied ? (
        <p role="alert">
          Не удалось получить доступ к камере/микрофону — можно продолжить
          без них, проверьте разрешения браузера.
        </p>
      ) : null}
    </form>
  );
}

/* eslint-enable react/prop-types */

export default JoinGate;
