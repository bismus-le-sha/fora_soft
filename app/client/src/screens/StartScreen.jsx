import styles from './StartScreen.module.css';
import {
  TOP_BAR,
  HERO,
  PATH_STEPS,
  ACTIVE_PATH_STEP_ID,
  NAME_CARD,
} from './StartScreen.content.js';
import NameEntryForm from '../components/NameEntryForm.jsx';
import { NAME_FOOTNOTE } from '../components/NameEntryForm.content.js';

/* eslint-disable react/prop-types -- пропсы описаны контрактом компонента, PropTypes не подключена. */
function StartScreen({ onCreate }) {
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

          <NameEntryForm id="start-screen-name" ctaLabel={NAME_CARD.ctaLabel} onSubmitName={onCreate} />

          <p className={styles.footnote}>{NAME_FOOTNOTE}</p>
        </div>
      </main>
    </div>
  );
}

export default StartScreen;

/* eslint-enable react/prop-types */
