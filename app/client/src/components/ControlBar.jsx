import { useState } from 'react';

/**
 * ControlBar.jsx — тумблеры mic/cam, «Выйти», «Копировать ссылку» (задача 27).
 *
 * Design §4.2 (дерево компонентов клиента): «`ControlBar.jsx` | тумблеры
 * mic/cam, «Выйти», «копировать ссылку» (F-03,09,10,17)». Отдельной строки
 * контракта пропсов для `ControlBar` таблица §4.2 не даёт (в отличие от
 * `VideoTile`) — контракт ниже следует уже установленному в клиенте
 * презентационному паттерну (`VideoGrid.jsx`/`VideoTile.jsx`, задачи 25/26):
 * компонент получает всё состояние/колбэки через props, никакой прямой
 * работы с сокетом/`mediaController` внутри — их вызывает `RoomScreen`
 * (Design §7.2/§7.3 sequence: «UI (ControlBar)» дёргает
 * `mediaController.toggleVideo()`, здесь это `onToggleAudio`/`onToggleVideo`
 * колбэки, реально подключённые к `useMedia` в `RoomScreen`).
 *
 * Единственное исключение — копирование ссылки в буфер: `navigator.clipboard`
 * вызывается прямо здесь (не вынесено в колбэк-проп), т.к. это чистая
 * презентационная деталь UI (как открытие/закрытие локального состояния
 * подтверждения), не бизнес-оркестрация комнаты; тестируется через тот же
 * DI-приём `deps`, что `deps.getUserMedia` в `JoinGate.jsx`/
 * `mediaController.js` (`deps.clipboardWrite`, по умолчанию
 * `navigator.clipboard.writeText`).
 *
 * Requirements: F-03, F-09, F-10, F-17, US-3, US-7, US-10.
 * Design: §4.2, §7.2, §7.3.
 */

/**
 * @param {string} text
 * @returns {Promise<void>}
 */
function defaultClipboardWrite(text) {
  return globalThis.navigator.clipboard.writeText(text);
}

/* eslint-disable react/prop-types -- проект типизирует пропсы JSDoc-аннотациями
   (см. VideoGrid.jsx/VideoTile.jsx/JoinGate.jsx/StartScreen.jsx), PropTypes не
   подключена (Design §3.2/§10.5 SEC-19). */

/**
 * @param {object} props
 * @param {{audio?: boolean, video?: boolean}} [props.mediaState] — текущее
 *   состояние тумблеров (Design §5.3 `Participant.media`/§7.2 `media:state`),
 *   в рантайме — `useMedia().mediaState` из `RoomScreen`.
 * @param {() => void} props.onToggleAudio — клик по тумблеру микрофона
 *   (в рантайме — `useMedia().toggleAudio`, которая сама эмитит `media:state`,
 *   Design §7.2).
 * @param {() => void} props.onToggleVideo — клик по тумблеру камеры
 *   (в рантайме — `useMedia().toggleVideo`, Design §7.2).
 * @param {() => void} props.onLeave — клик по «Выйти» (в рантайме —
 *   `signaling.emit('leave')`, Design §7.3 `leave { }`, без payload).
 * @param {string} [props.roomUrl] — URL текущей комнаты для копирования в
 *   буфер (в рантайме — `${window.location.origin}/room/${roomId}`,
 *   формируется `RoomScreen`, тот же формат, что маршрут `/room/:roomId` в
 *   `App.jsx`, US-3/US-10).
 * @param {object} [props.deps]
 * @param {(text: string) => Promise<void>} [props.deps.clipboardWrite] —
 *   фабрика записи в буфер обмена, только для тестируемости; по умолчанию
 *   реальный `navigator.clipboard.writeText`.
 */
function ControlBar({ mediaState = {}, onToggleAudio, onToggleVideo, onLeave, roomUrl, deps = {} }) {
  const [copyFeedback, setCopyFeedback] = useState(false);

  const clipboardWrite = deps.clipboardWrite ?? defaultClipboardWrite;

  const audioOn = mediaState.audio !== false;
  const videoOn = mediaState.video !== false;

  /**
   * US-3/US-10 «Копировать ссылку»: пишет URL комнаты в буфер и показывает
   * подтверждение. Отказ записи (запрет доступа к буферу/небезопасный
   * контекст) не должен ронять UI — перехватывается молча, без подтверждения
   * (тот же принцип «не бросать наружу», что `mediaController.js`/`JoinGate.jsx`
   * для отказа `getUserMedia`, Design §8).
   */
  async function handleCopyLink() {
    try {
      await clipboardWrite(roomUrl ?? '');
      setCopyFeedback(true);
    } catch {
      setCopyFeedback(false);
    }
  }

  return (
    <div className="control-bar" data-testid="control-bar">
      <button
        type="button"
        data-testid="toggle-audio"
        aria-pressed={audioOn}
        onClick={onToggleAudio}
      >
        {audioOn ? 'Выключить микрофон' : 'Включить микрофон'}
      </button>

      <button
        type="button"
        data-testid="toggle-video"
        aria-pressed={videoOn}
        onClick={onToggleVideo}
      >
        {videoOn ? 'Выключить камеру' : 'Включить камеру'}
      </button>

      <button type="button" data-testid="copy-link-button" onClick={handleCopyLink}>
        Копировать ссылку
      </button>
      {copyFeedback ? (
        <span role="status" data-testid="copy-link-confirmation">
          Ссылка скопирована
        </span>
      ) : null}

      <button type="button" data-testid="leave-button" onClick={onLeave}>
        Выйти
      </button>
    </div>
  );
}

/* eslint-enable react/prop-types */

export default ControlBar;
