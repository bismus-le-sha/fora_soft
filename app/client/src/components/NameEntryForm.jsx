import { useState } from 'react';
import { NAME_ERROR_CODES, NAME_MAX, validateParticipantName } from '../lib/nameValidation.js';
import {
  INVALID_CTA_LABEL,
  NAME_HINTS,
  NAME_LABEL,
  NAME_PLACEHOLDER,
} from './NameEntryForm.content.js';
import styles from './NameEntryForm.module.css';

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

/* eslint-disable react/prop-types -- пропсы описаны контрактом компонента, PropTypes не подключена. */

function NameEntryForm({ id, ctaLabel, onSubmitName }) {
  const [name, setName] = useState('');
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [isCtaHovered, setIsCtaHovered] = useState(false);
  const validation = validateParticipantName(name);
  const isValid = validation.ok;
  const hasValidationError =
    validation.code === NAME_ERROR_CODES.invalidChars ||
    validation.code === NAME_ERROR_CODES.tooLong;

  function handleSubmit(event) {
    event.preventDefault();
    if (!isValid) {
      setHasAttemptedSubmit(true);
      return;
    }
    onSubmitName(validation.value);
  }

  let hintText = NAME_HINTS.empty;
  let hintClassName = styles.hint;
  if (isValid) {
    hintText = NAME_HINTS.valid;
    hintClassName = `${styles.hint} ${styles.hintValid}`;
  } else if (validation.code === NAME_ERROR_CODES.invalidChars) {
    hintText = NAME_HINTS.invalidChars;
    hintClassName = `${styles.hint} ${styles.hintError}`;
  } else if (validation.code === NAME_ERROR_CODES.tooLong) {
    hintText = NAME_HINTS.tooLong;
    hintClassName = `${styles.hint} ${styles.hintError}`;
  } else if (hasAttemptedSubmit) {
    hintText = NAME_HINTS.emptyAfterAttempt;
  }

  const visibleCtaLabel = !isValid && isCtaHovered ? INVALID_CTA_LABEL : ctaLabel;

  return (
    <form className={styles.card} onSubmit={handleSubmit}>
      <div className={styles.cardHead}>
        <label className={styles.label} htmlFor={id}>
          {NAME_LABEL}
        </label>
        <span className={`${styles.counter} ${validation.code === NAME_ERROR_CODES.tooLong ? styles.counterError : ''}`}>
          {name.length}/{NAME_MAX}
        </span>
      </div>
      <div className={styles.inputWrap}>
        <input
          id={id}
          className={`${styles.input} ${hasValidationError ? styles.inputError : ''}`}
          type="text"
          value={name}
          autoComplete="name"
          placeholder={NAME_PLACEHOLDER}
          aria-invalid={hasValidationError}
          aria-describedby={`${id}-hint`}
          onChange={(event) => setName(event.target.value)}
        />
        {hasValidationError ? (
          <span className={styles.inputWarning} aria-hidden="true">
            ⚠
          </span>
        ) : null}
      </div>
      <p id={`${id}-hint`} className={hintClassName} aria-live="polite">
        {hintText}
      </p>
      <button
        type="submit"
        className={`${styles.cta} ${!isValid ? styles.ctaInvalid : ''}`}
        aria-disabled={!isValid}
        onMouseEnter={() => setIsCtaHovered(true)}
        onMouseLeave={() => setIsCtaHovered(false)}
        onFocus={() => setIsCtaHovered(true)}
        onBlur={() => setIsCtaHovered(false)}
      >
        {visibleCtaLabel}
        <ArrowIcon />
      </button>
    </form>
  );
}

/* eslint-enable react/prop-types */

export default NameEntryForm;
