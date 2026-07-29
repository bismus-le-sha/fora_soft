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

const ROOM_CAPACITY = 4;
const INVITE_COPY_FEEDBACK_MS = 2200;

function defaultClipboardWrite(text) {
  return globalThis.navigator.clipboard.writeText(text);
}

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

function VideoGrid({
  participants,
  selfId = null,
  localStream = null,
  remoteStreams = {},
  speakingParticipantIds = [],
  roomUrl = '',
  isChatOpen = false,
  selfDeviceDenied = false,
  deps = {},
}) {
  const count = participants.length;

  const activeSpeakerId = useMemo(
    () => computeActiveSpeakerId(participants, selfId, speakingParticipantIds),
    [participants, selfId, speakingParticipantIds],
  );
  const activeSpeaker = participants.find((participant) => participant.id === activeSpeakerId) ?? null;
  const ribbonParticipants = participants.filter((participant) => participant.id !== activeSpeakerId);
  const showStageLayout = Boolean(activeSpeaker);
  const showInviteCard = count === 1;
  const showFreeSlot = count > 1 && count < ROOM_CAPACITY && showStageLayout;

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
        isSpeaking={speakingParticipantIds.includes(participant.id)}
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
          {showStageLayout ? (
            renderTile(activeSpeaker, 'stage')
          ) : (
            <div className={styles.gallery} data-testid="video-gallery">
              {participants.map((participant) => (
                <div key={participant.id} className={styles.galleryTile}>
                  {renderTile(participant, 'stage')}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {count === 0 ? null : showInviteCard ? (
        <InviteCard roomUrl={roomUrl} deps={deps} />
      ) : showStageLayout ? (
        <div className={`${styles.ribbon} ${isChatOpen ? styles.ribbonNarrow : ''}`} data-testid="video-ribbon">
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
      ) : null}
    </div>
  );
}

export default VideoGrid;
