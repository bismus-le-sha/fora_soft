import { useEffect, useRef, useState } from 'react';
import styles from './VideoTile.module.css';
import {
  PLACEHOLDER_OFF_LABEL,
  PLACEHOLDER_NO_ACCESS_LABEL,
  PLACEHOLDER_CONNECTING_SUFFIX,
  PLACEHOLDER_CONNECTING_HINT,
  SPEAKING_LABEL,
  UNMUTE_LABEL,
  MIC_OFF_ARIA_LABEL,
} from './VideoTile.content.js';

/**
 * VideoTile.jsx — self/remote плитка: видео **или** заглушка-силуэт с именем
 * (задача 26; варианты сцена/лента и 3 причины заглушки — задача 40).
 *
 * Design §4.2 (таблица компонентов клиента): «`VideoTile.jsx` | Рендер видео
 * **или** заглушки-силуэта с именем; оверлей имени (экранированный `{name}`);
 * иконка mic-off. | props: `participant, stream, mediaState, isSelf`».
 *
 * Design §10.1 SEC-04: «React рендерит пользовательский контент только через
 * `{value}` (текстовые узлы) в … `VideoTile`-оверлее … `dangerouslySetInnerHTML`
 * запрещён». Имя участника здесь рендерится ИСКЛЮЧИТЕЛЬНО как `{participant.name}`
 * — текстовый узел JSX, без `dangerouslySetInnerHTML`/`innerHTML`/ручного DOM
 * (в том числе в подписи причины «participant подключается» ниже — тот же приём).
 *
 * Design §11.3 (нон-крит тесты): «VideoTile: при `video:false` — заглушка-силуэт
 * + имя; при `audio:false` — иконка mic-off».
 *
 * Addendum §3 (задача 40, `VideoTile.jsx` RESTRUCTURE): два размерных варианта
 * (`variant="stage"` | `"ribbon"`, README §4) — отличаются размером силуэта
 * заглушки и тем, показывается ли mono-подпись причины (только на сцене,
 * README §4 «Лента справа»: «без mono-подписи — она есть лишь на большой
 * сцене»). Три причины заглушки (README §6), в порядке приоритета:
 * 1. `noAccess` (устройство недоступно/пропало) — сигнал доступен ТОЛЬКО для
 *    self-плитки (`useMedia().deviceDenied`, задача 30/31) — протокол
 *    `media:state` не переносит эту причину для остальных участников
 *    (addendum §5.1: сознательно вне объёма новых протокольных полей);
 * 2. `mediaState.video === false` — камеру выключили сами (тумблер/сервер);
 * 3. иначе, если видео ожидается, но `stream` ещё не пришёл — участник
 *    подключается (README §6 п.3) — актуально для remote-плиток, пока mesh
 *    не установил соединение.
 *
 * Заглушка (силуэт) рендерится, если видео недоступно по любой из причин
 * (F-14/F-18, US-12): `mediaState.video === false` (тумблер выключен),
 * `stream` отсутствует (ещё не пришёл/не подключился peer) или доступа к
 * камере вовсе не было (`mediaState.video` не `true`) — единое условие
 * `hasVideo = Boolean(stream) && mediaState.video !== false` покрывает все
 * три случая одним булевым флагом.
 *
 * `<video>` — не текстовый контент (сырой медиапоток), поэтому
 * `dangerouslySetInnerHTML` тут ни при чём в принципе; поток подключается
 * через `ref` + `useEffect` (`videoRef.current.srcObject = stream`) —
 * стандартный React-паттерн для `MediaStream`, не нарушает SEC-04 (тот
 * запрещает вставку пользовательского **текста/HTML**, а не самого элемента
 * `<video>`).
 *
 * Задача 31 («Крайние случаи медиа: autoplay, потеря устройства, graceful
 * P2P», Design §8 «Autoplay заблокирован», F-37, US-13): звук удалённого
 * участника доверен ОТДЕЛЬНОМУ скрытому `<audio autoPlay>`, а не `<video>` —
 * так он продолжает играть, даже когда видео недоступно (камера
 * выключена/отсутствует — тогда рендерится плейсхолдер БЕЗ `<video>` вовсе,
 * но звук собеседника всё равно должен быть слышен). `<video>` для remote
 * поэтому теперь всегда `muted` (визуал без звука — звук идёт через
 * `<audio>`, иначе было бы задвоение). Self-плитка `<audio>` не получает —
 * себя самого слышать не нужно (эхо), видео self и так `muted`.
 *
 * Явный `audioEl.play()` (в дополнение к атрибуту `autoPlay`) нужен, чтобы
 * получить Promise и обработать возможный `reject` браузерной autoplay-
 * политики (voспроизведение без предшествующего жеста пользователя) — при
 * реджекте показывается кнопка «Включить звук», повторный клик по которой
 * вызывает `play()` ещё раз (тот же паттерн, что описан в Design §8: «вход =
 * user-gesture… fallback-кнопка при `play()` reject»).
 *
 * Requirements: F-08, F-14, F-16, F-18, F-37, US-6, US-12, US-13, SEC-04.
 * Design: §4.2, §8, §10.1, §11.3.
 */

/* eslint-disable react/prop-types -- проект типизирует пропсы JSDoc-аннотациями
   (см. VideoGrid.jsx/JoinGate.jsx/StartScreen.jsx/RoomScreen.jsx), PropTypes не
   подключена (Design §3.2/§10.5 SEC-19). */

/**
 * @param {object} props
 * @param {{id: string, name: string}} props.participant — участник (Design §5.3);
 *   `name` — уже провалидированное/санитизированное сервером имя (SEC-01/03),
 *   но рендерится здесь как текстовый узел независимо (SEC-04, defense in depth).
 * @param {MediaStream | null} [props.stream] — видеопоток участника (локальный
 *   `useMedia().localStream` для self, `useMesh().remoteStreams[id]` для остальных);
 *   `null`/`undefined` — видео недоступно (не подключился/не пришёл поток).
 * @param {{audio?: boolean, video?: boolean}} [props.mediaState] — текущее
 *   состояние тумблеров (Design §5.3 `Participant.media`/§7.2 `media:state`).
 * @param {boolean} [props.isSelf] — self-плитка (Design §6.2 `join:ok.selfId`);
 *   влияет на подпись `(я)` и на то, рендерится ли отдельный `<audio>` для
 *   звука (self не слушает сам себя, задача 31 — см. JSDoc модуля).
 * @param {'stage' | 'ribbon'} [props.variant] — размерный вариант (задача 40,
 *   README §4): `'stage'` — сцена (крупный силуэт + mono-подпись причины +
 *   эквалайзер «ГОВОРИТ» при наличии видео), `'ribbon'` — лента (мелкий
 *   силуэт, без подписи причины). По умолчанию `'ribbon'`.
 * @param {boolean} [props.noAccess] — устройство недоступно/пропало (README
 *   §6 п.2); имеет смысл ТОЛЬКО для self-плитки — протокол не переносит эту
 *   причину для остальных участников (см. JSDoc модуля, addendum §5.1).
 *   По умолчанию `false`.
 */
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
  /**
   * Причина заглушки (README §6), в порядке приоритета — см. JSDoc модуля:
   * `noAccess` > `video === false` (выключили сами) > нет потока (подключается).
   * `null`, когда видео реально показывается (`hasVideo`).
   */
  const placeholderReason = hasVideo
    ? null
    : noAccess
      ? 'no-access'
      : mediaState.video === false
        ? 'off'
        : 'connecting';
  // Задача 31: звук чужого участника не зависит от того, показывается ли его
  // видео (см. JSDoc модуля) — только от наличия потока и того, что это НЕ
  // self-плитка (себя не слушаем).
  const hasRemoteAudio = Boolean(stream) && !isSelf;

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = hasVideo ? stream : null;
    }
  }, [stream, hasVideo]);

  /**
   * Design §8 «Autoplay заблокирован»/F-37: пытается воспроизвести звук
   * собеседника при каждом изменении потока; при `play()` reject (браузер
   * заблокировал автозапуск без свежего жеста пользователя) показывает
   * fallback-кнопку вместо того, чтобы тихо промолчать (Design §8/SEC-15 —
   * пользователю нужен явный способ восстановить звук, а не белый экран).
   */
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

  /** Клик по «Включить звук» — повторная попытка `play()` тем же жестом. */
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
                <span className={`${styles.captionMono} ${styles.captionOff}`}>
                  {PLACEHOLDER_OFF_LABEL}
                </span>
              ) : placeholderReason === 'no-access' ? (
                <span className={`${styles.captionMono} ${styles.captionNoAccess}`}>
                  {PLACEHOLDER_NO_ACCESS_LABEL}
                </span>
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

      {isStage && hasVideo ? (
        <div className={styles.speaking} data-testid="video-tile-speaking">
          <span className={styles.speakingBars} aria-hidden="true">
            <span className={styles.speakingBar} />
            <span className={styles.speakingBar} />
            <span className={styles.speakingBar} />
          </span>
          <span className={styles.speakingLabel}>{SPEAKING_LABEL}</span>
        </div>
      ) : null}

      {hasRemoteAudio ? (
        <audio ref={audioRef} data-testid="video-tile-audio" autoPlay hidden />
      ) : null}

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

      <div className="video-tile-overlay">
        <span className="video-tile-name" data-testid="video-tile-name">
          {participant.name}
          {isSelf ? ' (я)' : ''}
        </span>
        {mediaState.audio === false ? (
          <span
            className="video-tile-mic-off"
            data-testid="video-tile-mic-off"
            role="img"
            aria-label={MIC_OFF_ARIA_LABEL}
          >
            🔇
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* eslint-enable react/prop-types */

export default VideoTile;
