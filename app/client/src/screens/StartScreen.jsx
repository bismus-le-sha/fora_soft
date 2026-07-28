import { useState } from 'react';
import styles from './StartScreen.module.css';

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
 * (`StartScreen.module.css`) — токены из `styles/tokens.css`.
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
 * о валидности значения. Состояния README §9 «> 30 символов» и «недопустимые
 * символы» здесь сознательно не реализованы — они относятся к более богатой
 * серверной валидации (regex/лимит), которая вне скоупа задачи 35 и не
 * достижима при текущей клиентской логике `trim().length > 0` (переполнение
 * длины физически блокируется атрибутом `maxLength`, разрешённые символы не
 * ограничиваются клиентом вовсе).
 */

/** PRD §4 «Стартовый экран»: поле имени до 30 символов (US-1, UX-подсказка). */
const NAME_MAX = 30;

/**
 * Путь-схема (README §1): порядок шагов «ссылка → имя → комната». На этом
 * экране пройден шаг «ссылка» ещё не начат — пользователь как раз вводит
 * имя, поэтому активна пилюля «имя» (см. задание задачи 35).
 */
const PATH_STEPS = [
  { id: 'link', label: 'ссылка' },
  { id: 'name', label: 'имя' },
  { id: 'room', label: 'комната' },
];
const ACTIVE_PATH_STEP_ID = 'name';

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
  const isOverLimit = name.length > NAME_MAX;

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
    hintText = 'Готово — можно заходить';
    hintClassName = `${styles.hint} ${styles.hintValid}`;
  } else if (hasAttemptedSubmit) {
    hintText = 'Введите имя — его увидят другие участники';
  } else {
    hintText = 'Как вас представить остальным?';
  }

  return (
    <div className={styles.screen}>
      <header className={styles.topBar}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true" />
          <span>Комната</span>
        </div>
        <p className={styles.topBarNote}>до 4 участников · без регистрации</p>
      </header>

      <main className={styles.main}>
        <div className={styles.centerStack}>
          <p className={styles.eyebrow}>VIDEO ROOM</p>
          <h1 className={styles.title}>Позвоните без лишних шагов</h1>
          <p className={styles.subtitle}>
            Создайте комнату, отправьте ссылку. До четырёх человек, прямо в браузере.
          </p>

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
                Ваше имя
              </label>
              <span className={`${styles.counter} ${isOverLimit ? styles.counterOver : ''}`}>
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
              placeholder="Например, Аня"
              onChange={(event) => setName(event.target.value)}
            />
            <p className={hintClassName}>{hintText}</p>
            <button type="submit" className={styles.cta} disabled={!isValid}>
              Создать комнату
              <ArrowIcon />
            </button>
          </form>

          <p className={styles.footnote}>Ничего не сохраняем — имя нужно только для этого звонка</p>
        </div>
      </main>
    </div>
  );
}

/* eslint-enable react/prop-types */

export default StartScreen;
