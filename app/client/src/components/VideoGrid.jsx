import { useEffect, useMemo, useRef, useState } from 'react';
import VideoTile from './VideoTile.jsx';
import styles from './VideoGrid.module.css';
import { computeActiveSpeakerId } from '../lib/activeSpeaker.js';
import {
  FREE_SLOT_TEXT,
  INVITE_HEADING,
  INVITE_TEXT,
  INVITE_COPY_LABEL,
  INVITE_COPIED_LABEL,
} from './VideoGrid.content.js';

/**
 * VideoGrid — рабочая область комнаты: Сцена (16:9, активный участник) +
 * Лента справа (задача 39, реструктуризация плоской сетки задачи 25).
 *
 * Design addendum §3 (`VideoGrid.jsx`, RESTRUCTURE), §5.1. Источник
 * значений — `design-handoff/README.md` §4 «Рабочая область». Утверждённая
 * композиция — вариант 1c «Говорящий крупно» (addendum §0).
 *
 * Активный участник (`computeActiveSpeakerId`, `lib/activeSpeaker.js`,
 * addendum §5.1) занимает Сцену; остальные — Ленту справа (`ribbonTile`
 * каждый). Раскладка Ленты зависит от общего числа участников комнаты
 * (`ROOM_CAPACITY = 4`, Design §9 «Configuration»):
 * - 1 участник (только self) — вместо Ленты карточка приглашения
 *   (`InviteCard` ниже, README §4 «Комната из одного участника»);
 * - 2–3 участника — Лента + свободный слот (`FreeSlot` ниже, README §4);
 * - 4 участника — Лента без свободного слота (заполнена).
 * Ширина Ленты (`292px` → `208px`) сжимается при открытой панели чата —
 * проп `isChatOpen` (default `false`), реальная проводка — задача 41 (в
 * `RoomTopBar.jsx` открытие панели пока чисто визуальный локальный тумблер,
 * не связанный с `RoomScreen`, см. его JSDoc); механизм сжатия готов здесь
 * заранее, чтобы задаче 41 не пришлось трогать `VideoGrid.jsx` снова.
 *
 * `VideoTile` получает `variant="stage"`/`"ribbon"` от `renderTile` ниже —
 * размерные варианты сцена/лента и 3 состояния заглушки (README §4/§6)
 * реализованы в `VideoTile.jsx` (задача 40); здесь только контейнеры-обёртки
 * задают геометрию (`.stage`/`.ribbonTile`).
 *
 * Requirements: F-07, F-37, US-6, US-13. Design: addendum §3/§5.1, §4.2.
 *
 * `participants` включает самого себя (Design §5.3/§6.2 `join:ok.participants`
 * не исключает self) — self определяется сравнением `participant.id === selfId`
 * (тот же приём, что был в задаче 25).
 */

/* eslint-disable react/prop-types -- проект типизирует пропсы JSDoc-аннотациями
   (см. VideoTile.jsx/RoomTopBar.jsx/JoinGate.jsx/StartScreen.jsx), PropTypes не
   подключена (Design §3.2/§10.5 SEC-19). */

/** Design §9 (Configuration), addendum §4 — предел участников. */
const ROOM_CAPACITY = 4;

/** README §4 (карточка приглашения): подпись «Скопировано» на 2200ms, тот же тайминг, что тост шапки (задача 38). */
const INVITE_COPY_FEEDBACK_MS = 2200;

/** @param {string} text @returns {Promise<void>} */
function defaultClipboardWrite(text) {
  return globalThis.navigator.clipboard.writeText(text);
}

/**
 * Свободный слот (README §4: «когда участников 2–3») — три пульсирующие
 * точки + подсказка «отправьте ссылку», место, куда сядет следующий
 * присоединившийся; занимает место в Ленте заранее, чтобы раскладка не
 * «прыгала» при новом `participant:joined`.
 */
function FreeSlot() {
  return (
    <div className={styles.freeSlot} data-testid="video-grid-free-slot">
      <span className={styles.freeSlotDots} aria-hidden="true">
        <span className={styles.freeSlotDot} />
        <span className={styles.freeSlotDot} />
        <span className={styles.freeSlotDot} />
      </span>
      <span className={styles.freeSlotText}>{FREE_SLOT_TEXT}</span>
    </div>
  );
}

/**
 * Карточка приглашения (README §4: «Комната из одного участника») — заменяет
 * Ленту, пока в комнате только self; «Скопировать ссылку» — тот же паттерн
 * DI/toast, что «Скопировать ссылку» в `RoomTopBar.jsx` (задача 38), но
 * отдельный локальный стейт — независимый UI-элемент с собственным местом
 * показа подтверждения (README §4: подпись «Скопировано» прямо на кнопке,
 * не всплывающий тост поверх шапки).
 * @param {object} props
 * @param {string} [props.roomUrl]
 * @param {object} [props.deps]
 * @param {(text: string) => Promise<void>} [props.deps.clipboardWrite]
 */
function InviteCard({ roomUrl = '', deps = {} }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef(null);
  const clipboardWrite = deps.clipboardWrite ?? defaultClipboardWrite;

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  async function handleCopy() {
    try {
      await clipboardWrite(roomUrl);
      setCopied(true);
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setCopied(false);
        timeoutRef.current = null;
      }, INVITE_COPY_FEEDBACK_MS);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={styles.inviteCard} data-testid="video-grid-invite-card">
      <span className={styles.inviteDots} aria-hidden="true">
        <span className={styles.inviteDot} />
        <span className={styles.inviteDot} />
        <span className={styles.inviteDot} />
      </span>
      <h2 className={styles.inviteHeading}>{INVITE_HEADING}</h2>
      <p className={styles.inviteText}>{INVITE_TEXT}</p>
      <div className={styles.inviteLinkField} data-testid="video-grid-invite-link">
        {roomUrl}
      </div>
      <button
        type="button"
        className={styles.inviteCopyButton}
        data-testid="video-grid-invite-copy"
        onClick={handleCopy}
      >
        {copied ? INVITE_COPIED_LABEL : INVITE_COPY_LABEL}
      </button>
    </div>
  );
}

/**
 * @param {object} props
 * @param {Array<{id: string, name: string, media?: {audio?: boolean, video?: boolean}}>} props.participants
 *   — снимок состава комнаты (Design §5.3), включает self.
 * @param {string} [props.selfId] — id самого себя (Design §6.2 `join:ok.selfId`).
 * @param {MediaStream | null} [props.localStream] — собственный поток
 *   (`useMedia().localStream`), форвардится в self-плитку.
 * @param {Record<string, MediaStream>} [props.remoteStreams] — потоки
 *   остальных участников по peerId (`useMesh().remoteStreams`).
 * @param {string} [props.roomUrl] — URL комнаты (тот же, что «Скопировать
 *   ссылку» в `RoomTopBar`) — для карточки приглашения при 1 участнике.
 * @param {boolean} [props.isChatOpen] — задача 41 подключит реальное
 *   состояние сворачиваемой панели; пока default `false` (Лента полной
 *   ширины 292px).
 * @param {boolean} [props.selfDeviceDenied] — `useMedia().deviceDenied`
 *   (задача 30/31): отказ/потеря доступа к камере/микрофону. Форвардится в
 *   `VideoTile` как `noAccess` ТОЛЬКО для self-плитки (задача 40, README §6
 *   п.2) — протокол не переносит эту причину для остальных участников (см.
 *   JSDoc `VideoTile.jsx`).
 * @param {object} [props.deps] — DI, только для тестируемости.
 * @param {(text: string) => Promise<void>} [props.deps.clipboardWrite]
 */
function VideoGrid({
  participants,
  selfId = null,
  localStream = null,
  remoteStreams = {},
  roomUrl = '',
  isChatOpen = false,
  selfDeviceDenied = false,
  deps = {},
}) {
  const count = participants.length;

  const activeSpeakerId = useMemo(
    () => computeActiveSpeakerId(participants, selfId),
    [participants, selfId],
  );
  const activeSpeaker = participants.find((participant) => participant.id === activeSpeakerId) ?? null;
  const ribbonParticipants = participants.filter((participant) => participant.id !== activeSpeakerId);

  const showInviteCard = count === 1;
  const showFreeSlot = count > 1 && count < ROOM_CAPACITY;

  /**
   * Единая точка рендера плитки — Сцена и Лента используют один и тот же
   * приём (задача 25/31), различаясь только `variant` (задача 40, README §4).
   */
  function renderTile(participant, variant) {
    const isSelf = participant.id === selfId;
    const stream = isSelf ? localStream : (remoteStreams[participant.id] ?? null);
    return (
      <VideoTile
        key={participant.id}
        participant={participant}
        stream={stream}
        mediaState={participant.media ?? {}}
        isSelf={isSelf}
        variant={variant}
        noAccess={isSelf && selfDeviceDenied}
      />
    );
  }

  return (
    <div className={styles.workArea} data-testid="video-grid" data-count={count}>
      <div className={styles.stageWrap}>
        <div
          className={`${styles.stage} ${activeSpeaker && activeSpeaker.id === selfId ? styles.stageSelf : ''}`}
          data-testid="video-stage"
        >
          {activeSpeaker ? renderTile(activeSpeaker, 'stage') : null}
        </div>
      </div>

      {count === 0 ? null : showInviteCard ? (
        <InviteCard roomUrl={roomUrl} deps={deps} />
      ) : (
        <div
          className={`${styles.ribbon} ${isChatOpen ? styles.ribbonNarrow : ''}`}
          data-testid="video-ribbon"
        >
          {ribbonParticipants.map((participant) => (
            <div
              key={participant.id}
              className={`${styles.ribbonTile} ${participant.id === selfId ? styles.ribbonTileSelf : ''}`}
            >
              {renderTile(participant, 'ribbon')}
            </div>
          ))}
          {showFreeSlot ? <FreeSlot /> : null}
        </div>
      )}
    </div>
  );
}

/* eslint-enable react/prop-types */

export default VideoGrid;
