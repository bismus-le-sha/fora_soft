import styles from './JoinGate.module.css';
import {
  TOP_BAR,
  HERO,
  PATH_STEPS,
  ACTIVE_PATH_STEP_ID,
  NAME_CARD,
  PRESENCE,
} from './JoinGate.content.js';
import NameEntryForm from '../components/NameEntryForm.jsx';
import { NAME_FOOTNOTE } from '../components/NameEntryForm.content.js';

const MAX_AVATARS = 3;

const presenceListFormatter =
  typeof Intl !== 'undefined' && typeof Intl.ListFormat === 'function'
    ? new Intl.ListFormat('ru', { style: 'long', type: 'conjunction' })
    : null;

function getInitial(name) {
  const trimmed = String(name ?? '').trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
}

function formatPresenceText(participants) {
  const names = participants.map((participant) => participant.name);
  const joined = presenceListFormatter ? presenceListFormatter.format(names) : names.join(', ');
  return `${joined} ${PRESENCE.suffix}`;
}

/* eslint-disable react/prop-types -- проект типизирует пропсы JSDoc-аннотациями,
   PropTypes не подключена (Design §3.2/§10.5 SEC-19). */
function JoinGate({ onJoin, participants = [] }) {
  function handleValidName(name) {
    onJoin(name);
  }
  const visibleAvatars = participants.slice(0, MAX_AVATARS);
  const extraCount = participants.length - visibleAvatars.length;

  return (
    <div className={styles.screen}>
      <header className={styles.topBar}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true" />
          <span>{TOP_BAR.brandLabel}</span>
        </div>
        <p className={styles.topBarNote}>{TOP_BAR.note}</p>
      </header>

      <main className={styles.main}>
        <div className={styles.centerStack}>
          <p className={styles.eyebrow}>{HERO.eyebrow}</p>
          <h1 className={styles.title}>{HERO.title}</h1>
          <p className={styles.subtitle}>{HERO.subtitle}</p>
          <div className={styles.pathSchema}>
            <span className={styles.pathLine} aria-hidden="true" />
            <ol className={styles.pathSteps}>
              {PATH_STEPS.map((step, index) => (
                <li key={step.id} className={styles.pathStepWrap}>
                  <span
                    className={`${styles.pathPill} ${
                      step.id === ACTIVE_PATH_STEP_ID ? styles.pathPillActive : styles.pathPillInactive
                    }`}
                  >
                    {step.label}
                  </span>
                  {index < PATH_STEPS.length - 1 ? <span className={styles.pathDot} aria-hidden="true" /> : null}
                </li>
              ))}
            </ol>
          </div>

          <NameEntryForm
            id="join-gate-name"
            ctaLabel={NAME_CARD.ctaLabel}
            onSubmitName={handleValidName}
          />

          {visibleAvatars.length > 0 ? (
            <div className={styles.presencePill}>
              <div className={styles.avatarStack} aria-hidden="true">
                {visibleAvatars.map((participant, index) => (
                  <span
                    key={participant.id ?? index}
                    className={`${styles.avatar} ${index % 2 === 0 ? styles.avatarColor0 : styles.avatarColor1}`}
                  >
                    {getInitial(participant.name)}
                  </span>
                ))}
                {extraCount > 0 ? <span className={`${styles.avatar} ${styles.avatarMore}`}>{`+${extraCount}`}</span> : null}
              </div>
              <p className={styles.presenceText}>{formatPresenceText(participants)}</p>
            </div>
          ) : null}

          <p className={styles.footnote}>{NAME_FOOTNOTE}</p>
        </div>
      </main>
    </div>
  );
}

/* eslint-enable react/prop-types */

export default JoinGate;
