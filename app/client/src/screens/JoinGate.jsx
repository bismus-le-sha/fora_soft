import { useState } from 'react';
import styles from './JoinGate.module.css';
import {
  TOP_BAR,
  HERO,
  PATH_STEPS,
  ACTIVE_PATH_STEP_ID,
  NAME_CARD,
  HINTS,
  FOOTNOTE,
  PRESENCE,
  MEDIA_DENIED_MESSAGE,
  ROOM_LABEL_PREFIX,
} from './JoinGate.content.js';

/**
 * JoinGate — экран запроса имени при входе по ссылке `/room/:roomId`
 * (задача 20; визуальная реализация — задача 36).
 *
 * Design §4.2 (таблица компонентов): «`JoinGate.jsx` | Экран запроса имени
 * при входе по ссылке; **кнопка входа = user-gesture** для autoplay (F-37);
 * первичный `getUserMedia`. | props: `onJoin(name)`».
 * Design §7.1 (sequence «Вход и установка mesh»): «JoinGate: ввод имени +
 * user-gesture (autoplay)» → «getUserMedia (audio+video по умолчанию)» →
 * «join { roomId, name }» — три шага одной цепочки, инициированной кликом
 * по кнопке «Войти».
 * Design §8: «Отказ в доступе к камере/микрофону» → клиент НЕ «вылетает» и
 * остаётся в комнате с выключенными устройствами (F-33, US-12, SEC-21) —
 * здесь: `getUserMedia` reject не блокирует вызов `onJoin`, только помечает
 * отказ best-effort сообщением (полная обработка отказа/восстановления —
 * `mediaController.js`, задача 21, и баннеры, задача 30 — вне скоупа).
 *
 * UI Design Addendum §3 (`design-ui-video-chat-room.md`, статус RESTRUCTURE):
 * тот же путь-схема/карточка ввода, что `StartScreen.jsx` (задача 35), плюс
 * пилюля присутствия «N уже в комнате» с наложенными аватарами-инициалами —
 * новый элемент, которого не было вовсе (README §2). CSS Module
 * (`JoinGate.module.css`) — токены из `styles/tokens.css`, добавлены
 * аддитивно `--presence-pill-bg`/`--presence-pill-border`/`--avatar-1`/
 * `--avatar-2` под новую пилюлю. Весь пользовательский текст — в
 * `JoinGate.content.js` (`CLAUDE.md` → «Архитектура фронтенда: без хардкода,
 * компонент — кирпичик»).
 *
 * Requirements: F-01, F-04, F-37, US-1, US-4, US-13.
 *
 * Как и `StartScreen` (задача 19/35), компонент НЕ владеет сокетом/медиа-
 * состоянием самой комнаты — это `RoomScreen` (задача 24, «оркестрация:
 * media → mesh → signaling»). Здесь только: (а) UX-валидация имени
 * (источник истины — серверная `validateName`, SEC-01); (б) первичный
 * `getUserMedia`, вызванный **синхронно внутри обработчика клика** (до
 * первого `await`), чтобы засчитаться браузером как «user activation» —
 * без этого более поздний autoplay удалённого `<audio>/<video>` может быть
 * заблокирован политикой браузера (F-37); (в) вызов контрактного
 * `onJoin(name)` (Design §4.2) — фактический вход в комнату (signaling
 * `join {roomId, name}`) делает вызывающая сторона, аналогично `onCreate`
 * в `StartScreen`; (г) чисто визуальная пилюля присутствия — см. ниже.
 *
 * Поток, полученный здесь, **не сохраняется** — сразу останавливается
 * (`track.stop()` на каждом треке): это лишь «прайминг» разрешения/жеста.
 * Полноценное владение локальным потоком (тумблеры mic/cam) — обязанность
 * `mediaController.js` (задача 21), который запросит поток заново на
 * `RoomScreen`. Осознанный trade-off простоты — не прокидываем `MediaStream`
 * через контракт `onJoin(name)` на две задачи вперёд.
 *
 * **Пилюля присутствия — вёрстка без источника данных (задача 36).** Ни один
 * пункт плана (`impl-video-chat-room.md`, задачи 1–35) и ни один socket-
 * контракт (Design §4.1/§7) не вводит событие «кто уже в комнате до моего
 * входа» — сервер сообщает состав участников только ПОСЛЕ успешного `join`
 * (`join:ok.participants`, задача 9). Задача 36 — чисто визуальная (см.
 * `design-ui-video-chat-room.md` §6: «новых security-/data-integrity-
 * инвариантов не вводится»), поэтому здесь не заводится новый socket-запрос
 * «подсмотреть» комнату до входа — это был бы новый протокольный контракт вне
 * скоупа задачи. Вместо этого компонент принимает данные через проп
 * `participants` (по умолчанию `[]` — пилюля не рендерится) — тот же приём,
 * что бейдж непрочитанных в `RoomTopBar.jsx` из задачи 38 («без логики —
 * бейдж подключается в задаче 41»): вёрстка готова принять реальные данные,
 * когда появится отдельная задача на протокол «peek» состава комнаты до
 * входа; `App.jsx` пока не прокидывает этот проп (нечем).
 */

/** По прецеденту `StartScreen.jsx` (задача 19) — тот же UX-лимит имени. */
const NAME_MAX = 30;

/** Инлайн-SVG стрелки для CTA (README §1/§2: «тот же экран» — CTA сохраняет
 *  иконку-стрелку 15px справа, меняется только текст). */
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

/** README §2: аватары показываются максимум для ROOM_CAPACITY-1 участников,
 *  уже находящихся в комнате (сам входящий — четвёртый). Локальная константа
 *  по прецеденту `VideoGrid.jsx` (`ROOM_CAPACITY = 4`, Design §9 «Configuration»),
 *  клиент не импортирует серверный `config.js` (SEC-19 — раздельные рантаймы). */
const MAX_AVATARS = 3;

/** Русское форматирование списка имён («A и Б», «A, Б и В») — встроенный
 *  `Intl.ListFormat`, не новая npm-зависимость (Design §10.5 SEC-19). */
const presenceListFormatter =
  typeof Intl !== 'undefined' && typeof Intl.ListFormat === 'function'
    ? new Intl.ListFormat('ru', { style: 'long', type: 'conjunction' })
    : null;

/** @param {string} name */
function getInitial(name) {
  const trimmed = String(name ?? '').trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
}

/**
 * @param {Array<{ id?: string, name: string }>} participants
 * @returns {string}
 */
function formatPresenceText(participants) {
  const names = participants.map((participant) => participant.name);
  const joined = presenceListFormatter ? presenceListFormatter.format(names) : names.join(', ');
  return `${joined} ${PRESENCE.suffix}`;
}

/**
 * @param {MediaStreamConstraints} constraints
 * @returns {Promise<MediaStream>}
 */
function defaultGetUserMedia(constraints) {
  return globalThis.navigator.mediaDevices.getUserMedia(constraints);
}

/* eslint-disable react/prop-types -- проект типизирует пропсы JSDoc-аннотациями
   (см. StartScreen.jsx/signalingClient.js/compat.js), PropTypes как рантайм-
   зависимость не подключена (Design §3.2/§10.5 SEC-19). */

/**
 * @param {object} props
 * @param {string} [props.roomId] — id комнаты из URL (только для отображения, UX).
 * @param {(name: string) => void} props.onJoin — вызывается с валидным
 *   (непустым после trim) именем после первичного `getUserMedia` (Design §4.2).
 * @param {Array<{ id?: string, name: string }>} [props.participants] —
 *   участники, уже находящиеся в комнате (для пилюли присутствия, README §2).
 *   Чисто презентационные данные (см. JSDoc компонента выше про отсутствие
 *   источника) — по умолчанию `[]`, пилюля тогда не рендерится.
 * @param {object} [props.deps]
 * @param {(constraints: MediaStreamConstraints) => Promise<MediaStream>} [props.deps.getUserMedia]
 *   — фабрика запроса медиа, только для тестируемости (тот же DI-приём, что
 *   `target` в `lib/compat.js` и `deps.io` в `signalingClient.js`); по
 *   умолчанию реальный `navigator.mediaDevices.getUserMedia`.
 */
function JoinGate({ roomId, onJoin, participants = [], deps = {} }) {
  const [name, setName] = useState('');
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [mediaDenied, setMediaDenied] = useState(false);

  const getUserMedia = deps.getUserMedia ?? defaultGetUserMedia;

  const trimmedName = name.trim();
  const isValid = trimmedName.length > 0;

  /**
   * Обработчик сабмита — сама точка user-gesture (F-37). `getUserMedia`
   * вызывается синхронно первым действием внутри обработчика (см. JSDoc
   * компонента); `await` только на самом промисе запроса устройств.
   */
  async function handleSubmit(event) {
    event.preventDefault();
    if (!isValid) {
      setHasAttemptedSubmit(true);
      return;
    }

    try {
      const stream = await getUserMedia({ audio: true, video: true });
      setMediaDenied(false);
      for (const track of stream.getTracks()) {
        track.stop();
      }
    } catch {
      // Design §8 «Отказ в доступе»: не ронять приложение и не блокировать
      // вход — участник остаётся в комнате с выключенными устройствами.
      setMediaDenied(true);
    }

    onJoin(trimmedName);
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
          {roomId ? (
            <p className={styles.roomTag}>
              {ROOM_LABEL_PREFIX}
              {roomId}
            </p>
          ) : null}

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
              <label className={styles.label} htmlFor="join-gate-name">
                {NAME_CARD.label}
              </label>
              <span className={styles.counter}>
                {name.length}/{NAME_MAX}
              </span>
            </div>
            <input
              id="join-gate-name"
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
                {extraCount > 0 ? (
                  <span className={`${styles.avatar} ${styles.avatarMore}`}>{`+${extraCount}`}</span>
                ) : null}
              </div>
              <p className={styles.presenceText}>{formatPresenceText(participants)}</p>
            </div>
          ) : null}

          {mediaDenied ? (
            <p role="alert" className={styles.mediaDeniedAlert}>
              {MEDIA_DENIED_MESSAGE}
            </p>
          ) : null}

          <p className={styles.footnote}>{FOOTNOTE}</p>
        </div>
      </main>
    </div>
  );
}

/* eslint-enable react/prop-types */

export default JoinGate;
