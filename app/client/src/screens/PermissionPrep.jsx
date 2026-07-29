import styles from './PermissionPrep.module.css';
import { PERMISSION_PREP } from './PermissionPrep.content.js';

/**
 * PermissionPrep — промежуточный экран между подтверждением имени и ответом
 * браузера на `getUserMedia` (задача 37, design-handoff README §3).
 */
function PermissionPrep() {
  return (
    <main className={styles.screen} data-testid="permission-prep" aria-live="polite">
      <section className={styles.stack} aria-labelledby="permission-prep-title">
        <div className={styles.indicator} aria-hidden="true">
          <span className={styles.ring} />
          <span className={styles.disc}>
            <svg
              className={styles.icon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <path d="M12 19v2" />
            </svg>
          </span>
        </div>

        <h2 id="permission-prep-title" className={styles.title}>
          {PERMISSION_PREP.title}
        </h2>
        <p className={styles.description}>{PERMISSION_PREP.description}</p>

        <div className={styles.waitPlate}>
          <span className={styles.dots} aria-hidden="true">
            <span className={styles.dot} />
            <span className={styles.dot} />
            <span className={styles.dot} />
          </span>
          <span className={styles.waitText}>{PERMISSION_PREP.waitLabel}</span>
        </div>
      </section>
    </main>
  );
}

export default PermissionPrep;
