import { useEffect, useRef, useState } from 'react';
import styles from './VideoTile.module.css';
import {
  PLACEHOLDER_OFF_LABEL,
  PLACEHOLDER_NO_ACCESS_LABEL,
  PLACEHOLDER_CONNECTING_SUFFIX,
  PLACEHOLDER_CONNECTING_HINT,
  UNMUTE_LABEL,
  MIC_OFF_ARIA_LABEL,
  MIC_ON_ARIA_LABEL,
} from './VideoTile.content.js';

/* eslint-disable react/prop-types -- пропсы описаны контрактами компонентов, PropTypes не подключена. */

function VideoTile({
  participant,
  stream = null,
  mediaState = {},
  isSelf = false,
  variant = 'ribbon',
  noAccess = false,
}) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const hasVideo = Boolean(stream) && mediaState.video !== false;
  const isStage = variant === 'stage';
  const placeholderReason = hasVideo
    ? null
    : noAccess
      ? 'no-access'
      : mediaState.video === false
        ? 'off'
        : 'connecting';
  const hasRemoteAudio = Boolean(stream) && !isSelf;

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = hasVideo ? stream : null;
    }
  }, [stream, hasVideo]);

  useEffect(() => {
    if (!hasRemoteAudio || !audioRef.current) {
      setAudioBlocked(false);
      return;
    }

    audioRef.current.srcObject = stream;
    const playResult = audioRef.current.play();
    if (playResult && typeof playResult.then === 'function') {
      playResult.then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true));
    }
  }, [stream, hasRemoteAudio]);

  function handleUnmuteClick() {
    if (!audioRef.current) {
      return;
    }
    const playResult = audioRef.current.play();
    if (playResult && typeof playResult.then === 'function') {
      playResult.then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true));
    } else {
      setAudioBlocked(false);
    }
  }

  return (
    <div
      className={styles.tile}
      data-testid="video-tile"
      data-participant-id={participant.id}
      data-self={isSelf ? 'true' : 'false'}
    >
      {hasVideo ? (
        <video
          ref={videoRef}
          data-testid="video-tile-video"
          className={styles.video}
          autoPlay
          playsInline
          muted
        />
      ) : (
        <div
          className={`${styles.placeholder} ${
            placeholderReason === 'off'
              ? styles.placeholderOff
              : placeholderReason === 'no-access'
                ? styles.placeholderNoAccess
                : styles.placeholderConnecting
          }`}
          data-testid="video-tile-placeholder"
          data-reason={placeholderReason}
          data-variant={variant}
        >
          {placeholderReason === 'connecting' ? (
            <span className={styles.connectingDots} aria-hidden="true">
              <span className={styles.connectingDot} />
              <span className={styles.connectingDot} />
              <span className={styles.connectingDot} />
            </span>
          ) : (
            <span
              className={`${styles.silhouette} ${
                isStage ? styles.silhouetteStage : styles.silhouetteRibbon
              } ${placeholderReason === 'off' ? styles.silhouetteOff : styles.silhouetteNoAccess}`}
              aria-hidden="true"
            >
              <span className={styles.silhouetteHead} />
              <span className={styles.silhouetteBody} />
            </span>
          )}

          {isStage ? (
            <div className={styles.caption} data-testid="video-tile-placeholder-caption">
              {placeholderReason === 'off' ? (
                <span className={`${styles.captionMono} ${styles.captionOff}`}>{PLACEHOLDER_OFF_LABEL}</span>
              ) : placeholderReason === 'no-access' ? (
                <span className={`${styles.captionMono} ${styles.captionNoAccess}`}>{PLACEHOLDER_NO_ACCESS_LABEL}</span>
              ) : (
                <>
                  <span className={styles.captionConnectingMain}>
                    {participant.name} {PLACEHOLDER_CONNECTING_SUFFIX}
                  </span>
                  <span className={`${styles.captionMono} ${styles.captionConnectingHint}`}>
                    {PLACEHOLDER_CONNECTING_HINT}
                  </span>
                </>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* «ГОВОРИТ» намеренно не рендерится до появления реального VAD:
          положение участника на сцене само по себе не означает, что он говорит. */}

      {hasRemoteAudio ? <audio ref={audioRef} data-testid="video-tile-audio" autoPlay hidden /> : null}

      {audioBlocked ? (
        <button
          type="button"
          className={styles.unmutePill}
          data-testid="video-tile-unmute"
          onClick={handleUnmuteClick}
        >
          <span className={styles.unmuteIcon} aria-hidden="true">
            🔊
          </span>
          <span data-testid="video-tile-unmute-label">{UNMUTE_LABEL}</span>
        </button>
      ) : null}

      <div className={styles.overlay} data-testid="video-tile-overlay">
        <span className={styles.name} data-testid="video-tile-name">
          {participant.name}
          {isSelf ? ' (я)' : ''}
        </span>
        <span
          className={`${styles.micBadge} ${mediaState.audio === true ? styles.micBadgeOn : styles.micBadgeOff}`}
          data-testid={mediaState.audio === true ? 'video-tile-mic-on' : 'video-tile-mic-off'}
          role="img"
          aria-label={mediaState.audio === true ? MIC_ON_ARIA_LABEL : MIC_OFF_ARIA_LABEL}
        >
          {mediaState.audio === true ? '🎤' : '🔇'}
        </span>
      </div>
    </div>
  );
}

export default VideoTile;

/* eslint-enable react/prop-types */
