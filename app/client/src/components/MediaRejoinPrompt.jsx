import { useState } from 'react';
import { MEDIA_REJOIN_PROMPT } from './MediaRejoinPrompt.content.js';
import styles from './MediaRejoinPrompt.module.css';

/* eslint-disable react/prop-types -- пропсы описаны контрактом компонента, PropTypes не подключена. */

function MediaRejoinPrompt({ initialMediaState, onContinue }) {
  const [selection, setSelection] = useState({
    audio: initialMediaState?.audio === true,
    video: initialMediaState?.video === true,
  });

  function toggle(kind) {
    setSelection((current) => ({ ...current, [kind]: !current[kind] }));
  }

  return (
    <main className={styles.screen} data-testid="media-rejoin-prompt">
      <section className={styles.card} aria-labelledby="media-rejoin-title">
        <p className={styles.eyebrow}>{MEDIA_REJOIN_PROMPT.eyebrow}</p>
        <h1 id="media-rejoin-title" className={styles.title}>
          {MEDIA_REJOIN_PROMPT.title}
        </h1>
        <p className={styles.description}>{MEDIA_REJOIN_PROMPT.description}</p>
        <div className={styles.devices}>
          <button
            type="button"
            role="switch"
            aria-checked={selection.audio}
            className={`${styles.deviceToggle} ${selection.audio ? styles.deviceToggleActive : ''}`}
            onClick={() => toggle('audio')}
          >
            <span>{MEDIA_REJOIN_PROMPT.microphoneLabel}</span>
            <span className={styles.deviceState}>
              {selection.audio ? MEDIA_REJOIN_PROMPT.onLabel : MEDIA_REJOIN_PROMPT.offLabel}
            </span>
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={selection.video}
            className={`${styles.deviceToggle} ${selection.video ? styles.deviceToggleActive : ''}`}
            onClick={() => toggle('video')}
          >
            <span>{MEDIA_REJOIN_PROMPT.cameraLabel}</span>
            <span className={styles.deviceState}>
              {selection.video ? MEDIA_REJOIN_PROMPT.onLabel : MEDIA_REJOIN_PROMPT.offLabel}
            </span>
          </button>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={() => onContinue(selection)}>
            {MEDIA_REJOIN_PROMPT.continueLabel}
          </button>
        </div>
      </section>
    </main>
  );
}

/* eslint-enable react/prop-types */

export default MediaRejoinPrompt;
