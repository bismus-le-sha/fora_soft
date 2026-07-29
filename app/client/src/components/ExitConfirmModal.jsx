import styles from './ExitConfirmModal.module.css';
import { EXIT_CONFIRM } from './ExitConfirmModal.content.js';

/**
 * ExitConfirmModal.jsx — модалка подтверждения выхода (задача 42).
 *
 * Design addendum §3 (Gap-анализ, строка «§7 Подтверждение выхода» — NEW).
 * Источник вёрстки/копирайта: `design-handoff/README.md` §7 — оверлей
 * `inset:0` с блюром, карточка 380px, нейтральный тон (без красного/«Внимание»).
 *
 * Заменяет временный неоформленный гейт задачи 38 в `RoomScreen.jsx`
 * (`isExitConfirmOpen`): контракт колбэков не менялся — `onStay`/
 * `onConfirmLeave` соответствуют прежним `handleStay`/`handleConfirmLeave`,
 * `data-testid` (`exit-confirm`/`exit-confirm-stay`/`exit-confirm-leave`) те
 * же, что покрывали существующие тесты `RoomScreen.test.jsx` и
 * `e2e/leave-disconnect.spec.js` — реальная эмиссия `leave` по-прежнему
 * остаётся заботой `RoomScreen` (Design §7.3), этот компонент только
 * презентационный, как и остальные `components/*`.
 *
 * Requirements: US-9. Design: addendum §3, README §7.
 */

/* eslint-disable react/prop-types -- проект типизирует пропсы JSDoc-аннотациями
   (см. RoomTopBar.jsx/ChatSidePanel.jsx), PropTypes не подключена (Design §3.2/§10.5 SEC-19). */

/**
 * @param {object} props
 * @param {() => void} props.onStay — «Остаться»: закрыть модалку без выхода.
 * @param {() => void} props.onConfirmLeave — «Выйти» внутри модалки: реально
 *   эмитит `leave` (решает вызывающая сторона, `RoomScreen.jsx`).
 */
function ExitConfirmModal({ onStay, onConfirmLeave }) {
  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="exit-confirm-title"
      data-testid="exit-confirm"
    >
      <div className={styles.card}>
        <p className={styles.eyebrow} aria-hidden="true">
          {EXIT_CONFIRM.eyebrow}
        </p>
        <h2 id="exit-confirm-title" className={styles.title}>
          {EXIT_CONFIRM.question}
        </h2>
        <p className={styles.body}>{EXIT_CONFIRM.body}</p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.stayButton}
            data-testid="exit-confirm-stay"
            onClick={onStay}
          >
            {EXIT_CONFIRM.stayLabel}
          </button>
          <button
            type="button"
            className={styles.leaveButton}
            data-testid="exit-confirm-leave"
            onClick={onConfirmLeave}
          >
            {EXIT_CONFIRM.leaveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* eslint-enable react/prop-types */

export default ExitConfirmModal;
