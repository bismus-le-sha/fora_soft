import { useEffect, useRef } from 'react';

/**
 * VideoTile.jsx — self/remote плитка: видео **или** заглушка-силуэт с именем
 * (задача 26).
 *
 * Design §4.2 (таблица компонентов клиента): «`VideoTile.jsx` | Рендер видео
 * **или** заглушки-силуэта с именем; оверлей имени (экранированный `{name}`);
 * иконка mic-off. | props: `participant, stream, mediaState, isSelf`».
 *
 * Design §10.1 SEC-04: «React рендерит пользовательский контент только через
 * `{value}` (текстовые узлы) в … `VideoTile`-оверлее … `dangerouslySetInnerHTML`
 * запрещён». Имя участника здесь рендерится ИСКЛЮЧИТЕЛЬНО как `{participant.name}`
 * — текстовый узел JSX, без `dangerouslySetInnerHTML`/`innerHTML`/ручного DOM.
 *
 * Design §11.3 (нон-крит тесты): «VideoTile: при `video:false` — заглушка-силуэт
 * + имя; при `audio:false` — иконка mic-off».
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
 * Requirements: F-08, F-14, F-16, F-18, US-6, US-12, SEC-04.
 * Design: §4.2, §10.1, §11.3.
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
 *   влияет на подпись `(я)` и `muted` у `<video>` (не проигрывать своё же аудио).
 */
function VideoTile({ participant, stream = null, mediaState = {}, isSelf = false }) {
  const videoRef = useRef(null);
  const hasVideo = Boolean(stream) && mediaState.video !== false;

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = hasVideo ? stream : null;
    }
  }, [stream, hasVideo]);

  return (
    <div
      className="video-tile"
      data-testid="video-tile"
      data-participant-id={participant.id}
      data-self={isSelf ? 'true' : 'false'}
    >
      {hasVideo ? (
        <video
          ref={videoRef}
          data-testid="video-tile-video"
          className="video-tile-video"
          autoPlay
          playsInline
          muted={isSelf}
        />
      ) : (
        <div className="video-tile-placeholder" data-testid="video-tile-placeholder">
          <span className="video-tile-silhouette" aria-hidden="true">
            👤
          </span>
        </div>
      )}

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
            aria-label="Микрофон выключен"
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
