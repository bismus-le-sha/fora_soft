import { useState } from 'react';
import styles from './StartScreen.module.css';
import {
  TOP_BAR,
  HERO,
  PATH_STEPS,
  ACTIVE_PATH_STEP_ID,
  NAME_CARD,
  HINTS,
  FOOTNOTE,
} from './StartScreen.content.js';
import { NAME_ERROR_CODES, NAME_MAX, validateParticipantName } from '../lib/nameValidation.js';

function ArrowIcon() {
  return (
    <svg
      className={styles.ctaIcon}
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 7.5H12" />
      <path d="M8 3.5L12 7.5L8 11.5" />
    </svg>
  );
}

function StartScreen({ onCreate }) {
  const [name, setName] = useState('');
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [isCtaHovered, setIsCtaHovered] = useState(false);

  const validation = validateParticipantName(name);
  const isValid = validation.ok;

  function handleSubmit(event) {
    event.preventDefault();
    if (!isValid) {
      setHasAttemptedSubmit(true);
      return;
    }
    onCreate(validation.value);
  }

  let hintText = HINTS.empty;
  let hintClassName = styles.hint;
  if (isValid) {
    hintText = HINTS.valid;
    hintClassName = `${styles.hint} ${styles.hintValid}`;
  } else if (validation.code === NAME_ERROR_CODES.invalidChars) {
    hintText = HINTS.invalidChars;
  } else if (validation.code === NAME_ERROR_CODES.tooLong) {
    hintText = HINTS.tooLong;
  } else if (hasAttemptedSubmit) {
    hintText = HINTS.emptyAfterAttempt;
  }

  const ctaLabel = !isValid && isCtaHovered ? NAME_CARD.invalidCtaLabel : NAME_CARD.ctaLabel;

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

          <form className={styles.card} onSubmit={handleSubmit}>
            <div className={styles.cardHead}>
              <label className={styles.label} htmlFor="start-screen-name">
                {NAME_CARD.label}
              </label>
              <span className={styles.counter}>
                {name.length}/{NAME_MAX}
              </span>
            </div>
            <input
              id="start-screen-name"
              className={styles.input}
              type="text"
              value={name}
              maxLength={NAME_MAX}
              autoComplete="name"
              placeholder={NAME_CARD.placeholder}
              onChange={(event) => setName(event.target.value)}
            />
            <p className={hintClassName}>{hintText}</p>
            <button
              type="submit"
              className={`${styles.cta} ${!isValid ? styles.ctaInvalid : ''}`}
              aria-disabled={!isValid}
              onMouseEnter={() => setIsCtaHovered(true)}
              onMouseLeave={() => setIsCtaHovered(false)}
              onFocus={() => setIsCtaHovered(true)}
              onBlur={() => setIsCtaHovered(false)}
            >
              {ctaLabel}
              <ArrowIcon />
            </button>
          </form>

          <p className={styles.footnote}>{FOOTNOTE}</p>
        </div>
      </main>
    </div>
  );
}

export default StartScreen;
