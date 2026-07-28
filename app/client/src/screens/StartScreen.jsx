import { useState } from 'react';
import styles from './StartScreen.module.css';
import { TOP_BAR, HERO, PATH_STEPS, ACTIVE_PATH_STEP_ID, NAME_CARD, HINTS, FOOTNOTE } from './StartScreen.content.js';

/**
 * StartScreen — стартовый экран: ввод имени + «Создать комнату» (задача 19,
 * визуальная реализация — задача 35).
 *
 * Design §4.2 (таблица компонентов): «`StartScreen.jsx` | Ввод имени
 * (клиентская валидация — UX), «Создать комнату» → генерирует roomId и
 * переходит на `/room/:id`. | props: `onCreate(name)`».
 * Design §6.4 (URL-контракт): «Создание комнаты на StartScreen генерирует
 * `roomId = crypto.randomUUID()` (SEC-14) и делает `navigate(/room/:roomId)`».
 *
 * UI Design Addendum §3 (`design-ui-video-chat-room.md`, статус RESTRUCTURE):
 * путь-схема (3 mono-пилюли «ссылка/имя/комната», активна «имя» — путь ещё не
 * пройден до конца), карточка ввода с состояниями подсказки §9, сноска.
 * Источник точных значений — `design-handoff/README.md` §1/§9. CSS Module
 * (`StartScreen.module.css`) — токены из `styles/tokens.css`. Весь
 * пользовательский текст — в `StartScreen.content.js` (`CLAUDE.md` →
 * «Архитектура фронтенда: без хардкода, компонент — кирпичик»): компонент
 * не хардкодит копирайт литералами в JSX, а импортирует его из отдельного
 * модуля контента, оставаясь переиспользуемым «кирпичиком».
 *
 * Requirements: F-01, F-02, US-1, US-2.
 *
 * Компонент сам НЕ генерирует roomId и НЕ выполняет навигацию — это
 * ответственность вызывающей стороны (композиционный корень, App.jsx/будущая
 * задача маршрутизации), которая передаёт конкретный `onCreate(name)`,
 * вызывающий `generateRoomId()` (`lib/roomId.js`, SEC-14) и переход на
 * `/room/:roomId`. Здесь эта связка проверяется контрактно — валидный сабмит
 * триггерит `onCreate`, невалидный — нет (см. `tests/screens/StartScreen.test.jsx`).
 *
 * Валидация здесь — **только UX** (блокировка кнопки при пустом/пробельном
 * имени, `trim().length > 0`). Источник истины — серверная `validateName`
 * (SEC-01, Design §4.1); клиент ей не подменяет и не заменяет. Задача 35 —
 * чисто визуальная реструктуризация, логика валидации НЕ менялась (критерий
 * приёмки задачи 35 в `impl-video-chat-room.md`).
 *
 * `hasAttemptedSubmit` — локальный UI-флаг (не часть логики валидации): по
 * README §9 «после первой неудачной попытки подсказка меняется на явную».
 * Он только переключает ТЕКСТ подсказки под пустым именем, ничего не решает
 * о валидности значения. Реализованы только 3 реально достижимых при
 * текущей UX-валидации (`trim().length > 0`) состояния подсказки: пустое-
 * нетронутое / пустое-после-попытки / валидно. Состояния README §9
 * «> 30 символов» и «недопустимые символы» **сознательно не реализованы**:
 * они требуют более строгой клиентской валидации (regex разрешённых
 * символов/явная проверка лимита), которая вне скоупа задачи 35 — критерий
 * приёмки прямо запрещает менять существующую логику валидации. Переполнение
 * длины и так физически блокируется атрибутом `maxLength` на инпуте, поэтому
 * ветка «> 30» недостижима в принципе и не стилизуется как мёртвый код; при
 * появлении отдельной задачи на богатую UX-валидацию эти состояния можно
 * будет включить.
 */

/** PRD §4 «Стартовый экран»: поле имени до 30 символов (US-1, UX-подсказка). */
const NAME_MAX = 30;

/** Инлайн-SVG стрелки для CTA (README §1: «иконка-стрелка 15px справа»). */
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

/* eslint-disable react/prop-types -- проект типизирует пропсы JSDoc-аннотациями
   (см. signalingClient.js/compat.js), PropTypes как рантайм-зависимость не
   подключена (Design §3.2/§10.5 SEC-19 — минимум прод-зависимостей). */

/**
 * @param {object} props
 * @param {(name: string) => void} props.onCreate — вызывается с валидным
 *   (непустым после trim) именем при клике «Создать комнату» (Design §4.2).
 */
function StartScreen({ onCreate }) {
  const [name, setName] = useState('');
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  const trimmedName = name.trim();
  const isValid = trimmedName.length > 0;

  function handleSubmit(event) {
    event.preventDefault();
    if (!isValid) {
      setHasAttemptedSubmit(true);
      return;
    }
    onCreate(trimmedName);
  }

  let hintText;
  let hintClassName = styles.hint;
  if (isValid) {
    hintText = HINTS.valid;
    hintClassName = `${styles.hint} ${styles.hintValid}`;
  } else if (hasAttemptedSubmit) {
    hintText = HINTS.emptyAfterAttempt;
  } else {
    hintText = HINTS.empty;
  }

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
                  {index < PATH_STEPS.length - 1 ? (
                    <span className={styles.pathDot} aria-hidden="true" />
                  ) : null}
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
            <button type="submit" className={styles.cta} disabled={!isValid}>
              {NAME_CARD.ctaLabel}
              <ArrowIcon />
            </button>
          </form>

          <p className={styles.footnote}>{FOOTNOTE}</p>
        </div>
      </main>
    </div>
  );
}

/* eslint-enable react/prop-types */

export default StartScreen;
