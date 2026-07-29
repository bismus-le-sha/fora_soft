import { useEffect, useRef, useState } from 'react';
import styles from './RoomTopBar.module.css';
import {
  MEDIA_BUTTON_LABELS,
  COPY_LINK_LABEL,
  COPY_LINK_TOAST_TEXT,
  CHAT_BUTTON_LABEL,
  LEAVE_BUTTON_LABEL,
  formatParticipantCounter,
} from './RoomTopBar.content.js';
import { formatRoomCode } from '../lib/roomId.js';

/**
 * RoomTopBar.jsx — верхняя плашка комнаты: код комнаты, таймер звонка,
 * тумблеры mic/cam, «Скопировать ссылку» + тост, счётчик участников, «Чат»
 * (+бейдж непрочитанных), «Выйти» (задача 38).
 *
 * Design: `design-ui-video-chat-room.md` addendum §3 (`ControlBar.jsx`,
 * RESTRUCTURE — выделено в отдельный `RoomTopBar.jsx`, второй вариант,
 * явно допущенный формулировкой задачи 38 плана), §5.2 (`formatRoomCode`),
 * §5.3 (таймер). Источник значений — `design-handoff/README.md` §4
 * «Верхняя плашка».
 *
 * Заменяет собой `ControlBar.jsx` (задача 27) — тот же презентационный
 * паттерн (никакой прямой работы с сокетом/`mediaController`, всё через
 * props/колбэки; см. историю паттерна в JSDoc старого `ControlBar.jsx`).
 *
 * SEC-14 (addendum §4/§5.2): `roomCode` — чисто отображение через
 * `formatRoomCode(roomId)`, реальный `roomId` этот компонент никуда не
 * передаёт и не изменяет (не принимает его вовсе, только уже отформатированную
 * строку через сам `roomId`-проп, форматирование — внутри, реальный
 * `roomId`/URL/`join`-payload остаются заботой `RoomScreen`).
 *
 * «Выйти» задачи 38: клик вызывает `onRequestLeave`, а НЕ эмитит `leave`
 * напрямую (критерий приёмки задачи 38) — реальную полноценную модалку
 * подтверждения строит задача 42 (`components/ExitConfirmModal.jsx`, NEW,
 * README §7); до неё `RoomScreen` держит временный неоформленный гейт
 * подтверждения (см. его JSDoc) — интерфейс `onRequestLeave` не меняется,
 * когда задача 42 подключит настоящую модалку.
 *
 * «Чат»/бейдж непрочитанных — задача 38 создаёт только вёрстку и локальный
 * визуальный тумблер «открыт/закрыт» (`isChatOpen` — состояние этого
 * компонента, ничем пока не управляет — реальная сворачиваемая панель и
 * подсчёт непрочитанных вне скоупа, см. задачу 41); `unreadCount` — проп с
 * default 0 (бейдж не рендерится, пока задача 41 не начнёт передавать
 * реальное значение).
 *
 * Requirements: F-03, F-09, F-10, F-17, US-3, US-7, US-10.
 * Design: addendum §3/§5.2/§5.3, README §4.
 */

/** Design §9 (Configuration), addendum §4 — предел участников, не меняется этой задачей. */
const ROOM_CAPACITY = 4;

/** README §4 (тост): автоскрытие подтверждения копирования через 2200ms. */
const COPY_TOAST_DURATION_MS = 2200;

/** Addendum §5.3: «тик раз в секунду». */
const TIMER_TICK_MS = 1000;

/**
 * @param {string} text
 * @returns {Promise<void>}
 */
function defaultClipboardWrite(text) {
  return globalThis.navigator.clipboard.writeText(text);
}

/* README §4: иконки mic/cam 16px, только цвет/фон кнопки меняется по
   состоянию — сам глиф статичен, поэтому вынесен в модульные константы, не
   пересоздаётся на каждый рендер/тик таймера. */
const MIC_ON_ICON = (
  <svg className={styles.mediaIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3.5a2.6 2.6 0 0 1 2.6 2.6v4.4a2.6 2.6 0 0 1-5.2 0V6.1A2.6 2.6 0 0 1 12 3.5Z" />
    <path d="M6.5 10.5a5.5 5.5 0 0 0 11 0" />
    <path d="M12 16v4" />
  </svg>
);
const MIC_OFF_ICON = (
  <svg className={styles.mediaIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.4 5.6a2.6 2.6 0 0 1 5.2.5v4.4" />
    <path d="M6.5 10.5a5.5 5.5 0 0 0 8.3 4.8" />
    <path d="M4 3.5l16 17" />
  </svg>
);
const CAM_ON_ICON = (
  <svg className={styles.mediaIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 8a1.5 1.5 0 0 1 1.5-1.5H13A1.5 1.5 0 0 1 14.5 8v8A1.5 1.5 0 0 1 13 17.5H4.5A1.5 1.5 0 0 1 3 16Z" />
    <path d="M18.4 9.4 21 7.6v8.8l-2.6-1.8" />
  </svg>
);
const CAM_OFF_ICON = (
  <svg className={styles.mediaIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 10.2V9a1.5 1.5 0 0 0-1.5-1.5H8" />
    <path d="M4.2 7.6A1.5 1.5 0 0 0 2 9v6a1.5 1.5 0 0 0 1.5 1.5h10c.5 0 .9-.2 1.2-.6" />
    <path d="M20 8.4v7.2L16.6 13" />
    <path d="M4 3.5l16 17" />
  </svg>
);

/* eslint-disable react/prop-types -- см. общее обоснование ниже у RoomTopBar */
/**
 * Кнопка-тумблер mic/cam (README §4) — mic и cam различаются только набором
 * иконок/подписей, вся остальная разметка/поведение общие (было продублировано
 * дважды до code-review задачи 38).
 * @param {object} props
 * @param {string} props.testId
 * @param {boolean} props.pressed
 * @param {string} props.onLabel
 * @param {string} props.offLabel
 * @param {import('react').ReactNode} props.onIcon
 * @param {import('react').ReactNode} props.offIcon
 * @param {() => void} props.onClick
 */
function MediaToggleButton({ testId, pressed, onLabel, offLabel, onIcon, offIcon, onClick }) {
  return (
    <button
      type="button"
      className={styles.mediaButton}
      data-testid={testId}
      aria-pressed={pressed}
      aria-label={pressed ? onLabel : offLabel}
      onClick={onClick}
    >
      {pressed ? onIcon : offIcon}
    </button>
  );
}
/* eslint-enable react/prop-types */

/**
 * Addendum §5.3 «Таймер звонка (MM:SS)»: `joinedAt` — момент успешного
 * `join:ok` (`Date.now()`), не момент монтирования компонента — до `join:ok`
 * elapsed считается от «сейчас» на каждый тик, то есть остаётся `00:00`.
 * @param {number | null} joinedAt
 * @param {number} now
 * @returns {string} `MM:SS`
 */
function formatElapsed(joinedAt, now) {
  const elapsedMs = joinedAt ? Math.max(0, now - joinedAt) : 0;
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/* eslint-disable react/prop-types -- проект типизирует пропсы JSDoc-аннотациями
   (см. VideoGrid.jsx/VideoTile.jsx/JoinGate.jsx/StartScreen.jsx), PropTypes не
   подключена (Design §3.2/§10.5 SEC-19). */

/**
 * @param {object} props
 * @param {string} props.roomId — реальный `roomId` (Design §6.4), форматируется
 *   внутри через `formatRoomCode` только для отображения (SEC-14) — не уходит
 *   никуда за пределы этого компонента.
 * @param {number | null} [props.joinedAt] — `Date.now()` момента `join:ok`
 *   (addendum §5.3); `null`/`undefined`, пока вход ещё не подтверждён — таймер
 *   показывает `00:00`.
 * @param {{audio?: boolean, video?: boolean}} [props.mediaState] — Design
 *   §5.3/§7.2, в рантайме `useMedia().mediaState`.
 * @param {() => void} props.onToggleAudio — Design §7.2, `useMedia().toggleAudio`.
 * @param {() => void} props.onToggleVideo — Design §7.2, `useMedia().toggleVideo`.
 * @param {string} [props.roomUrl] — URL комнаты для «Скопировать ссылку»
 *   (тот же формат, что собирает `RoomScreen`).
 * @param {number} [props.participantCount] — `participants.length` (включая
 *   self, Design §5.3/§6.2) для счётчика `N/4`.
 * @param {number} [props.unreadCount] — задача 41 подключит реальный подсчёт;
 *   пока default 0 — бейдж не рендерится.
 * @param {() => void} [props.onToggleChat] — задача 41 подключит реальное
 *   открытие/закрытие панели; пока не обязателен (кнопка держит только
 *   собственный визуальный тумблер).
 * @param {() => void} props.onRequestLeave — клик «Выйти»: НЕ эмитит `leave`
 *   напрямую (критерий приёмки задачи 38) — открывает гейт подтверждения в
 *   `RoomScreen` (задача 42 — полноценная модалка).
 * @param {object} [props.deps]
 * @param {(text: string) => Promise<void>} [props.deps.clipboardWrite]
 * @param {() => number} [props.deps.now] — только для тестируемости таймера
 *   (по умолчанию `Date.now`), тот же приём, что `deps.clipboardWrite`.
 */
function RoomTopBar({
  roomId,
  joinedAt = null,
  mediaState = {},
  onToggleAudio,
  onToggleVideo,
  roomUrl,
  participantCount = 0,
  unreadCount = 0,
  onToggleChat,
  onRequestLeave,
  deps = {},
}) {
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [now, setNow] = useState(() => (deps.now ?? Date.now)());

  const clipboardWrite = deps.clipboardWrite ?? defaultClipboardWrite;
  const getNow = deps.now ?? Date.now;

  const copyToastTimeoutRef = useRef(null);

  useEffect(
    () => () => {
      if (copyToastTimeoutRef.current !== null) {
        clearTimeout(copyToastTimeoutRef.current);
      }
    },
    [],
  );

  /** Addendum §5.3: тик раз в секунду, независимо от того, известен ли уже `joinedAt`. */
  useEffect(() => {
    const intervalId = setInterval(() => setNow(getNow()), TIMER_TICK_MS);
    return () => clearInterval(intervalId);
    // `getNow` стабилен на весь жизненный цикл (либо `Date.now`, либо DI-фейк из `deps`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const audioOn = mediaState.audio !== false;
  const videoOn = mediaState.video !== false;
  const roomCode = formatRoomCode(roomId);
  const participantCounter = formatParticipantCounter(participantCount, ROOM_CAPACITY);

  /**
   * README §4 «Копировать ссылку»: пишет URL комнаты в буфер, показывает тост
   * на 2200ms (автоскрытие таймером). Отказ записи (запрет доступа к буферу/
   * небезопасный контекст) не должен ронять UI — перехватывается молча (тот
   * же принцип, что `mediaController.js`/`JoinGate.jsx`, Design §8).
   */
  async function handleCopyLink() {
    try {
      await clipboardWrite(roomUrl ?? '');
      setCopyFeedback(true);
      if (copyToastTimeoutRef.current !== null) {
        clearTimeout(copyToastTimeoutRef.current);
      }
      copyToastTimeoutRef.current = setTimeout(() => {
        setCopyFeedback(false);
        copyToastTimeoutRef.current = null;
      }, COPY_TOAST_DURATION_MS);
    } catch {
      setCopyFeedback(false);
    }
  }

  function handleToggleChat() {
    setIsChatOpen((open) => !open);
    onToggleChat?.();
  }

  return (
    <div className={styles.topBar} data-testid="room-top-bar">
      <div className={styles.left}>
        <span className={styles.brandMark} aria-hidden="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className={styles.brandMarkDot} />
          ))}
        </span>

        <span className={styles.roomCode} data-testid="room-code">
          {roomCode}
        </span>

        <span className={styles.divider} aria-hidden="true" />

        <span className={styles.status}>
          <span className={styles.statusDot} aria-hidden="true" />
          <span data-testid="call-timer">{formatElapsed(joinedAt, now)}</span>
        </span>
      </div>

      <div className={styles.right}>
        <MediaToggleButton
          testId="toggle-audio"
          pressed={audioOn}
          onLabel={MEDIA_BUTTON_LABELS.audioOn}
          offLabel={MEDIA_BUTTON_LABELS.audioOff}
          onIcon={MIC_ON_ICON}
          offIcon={MIC_OFF_ICON}
          onClick={onToggleAudio}
        />

        <MediaToggleButton
          testId="toggle-video"
          pressed={videoOn}
          onLabel={MEDIA_BUTTON_LABELS.videoOn}
          offLabel={MEDIA_BUTTON_LABELS.videoOff}
          onIcon={CAM_ON_ICON}
          offIcon={CAM_OFF_ICON}
          onClick={onToggleVideo}
        />

        <span className={styles.divider} aria-hidden="true" />

        <span className={styles.copyLinkWrap}>
          <button
            type="button"
            className={`${styles.pillButton} ${styles.copyLinkButton}`}
            data-testid="copy-link-button"
            onClick={handleCopyLink}
          >
            <span className={styles.copyLinkIconBox}>
              <svg className={styles.copyLinkIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" />
                <path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
              </svg>
            </span>
            {COPY_LINK_LABEL}
          </button>
          {copyFeedback ? (
            <span className={styles.copyToast} role="status" data-testid="copy-link-confirmation">
              <svg className={styles.copyToastIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12.5l5 5L20 6" />
              </svg>
              {COPY_LINK_TOAST_TEXT}
            </span>
          ) : null}
        </span>

        <span className={styles.counter} data-testid="participant-counter">
          <svg className={styles.counterIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
            <path d="M2.5 16.7c0-2.6 2.4-4.4 5.5-4.4s5.5 1.8 5.5 4.4" />
            <path d="M15 8.3a2 2 0 1 0 0-4" />
            <path d="M16.5 12.5c1.8.5 3 1.9 3 4.2" />
          </svg>
          {participantCounter}
        </span>

        <button
          type="button"
          className={`${styles.pillButton} ${isChatOpen ? styles.chatButtonOpen : styles.chatButton}`}
          data-testid="chat-toggle-button"
          aria-pressed={isChatOpen}
          onClick={handleToggleChat}
        >
          {CHAT_BUTTON_LABEL}
          {unreadCount > 0 ? (
            <span className={styles.chatBadge} data-testid="chat-unread-badge">
              {unreadCount}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          className={`${styles.pillButton} ${styles.leaveButton}`}
          data-testid="leave-button"
          onClick={onRequestLeave}
        >
          <svg className={styles.leaveIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
            <path d="M10 8l-4 4 4 4" />
            <path d="M15 12H6" />
          </svg>
          {LEAVE_BUTTON_LABEL}
        </button>
      </div>
    </div>
  );
}

/* eslint-enable react/prop-types */

export default RoomTopBar;
