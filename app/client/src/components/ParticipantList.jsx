/**
 * ParticipantList.jsx — актуальный состав комнаты в реальном времени
 * (задача 29).
 *
 * Design §4.2 (дерево/таблица компонентов клиента): «`ParticipantList.jsx` #
 * актуальный список (F-16)»; `RoomScreen.jsx` — «раскладка (VideoGrid +
 * RoomTopBar + ChatPanel + ParticipantList)». Design §10.1 SEC-04: «React
 * рендерит пользовательский контент только через `{value}` (текстовые узлы)
 * в `ChatPanel`, `VideoTile`-оверлее, `ParticipantList`. `dangerouslySetInnerHTML`
 * запрещён (lint-правило)». Имя участника здесь рендерится ИСКЛЮЧИТЕЛЬНО как
 * `{participant.name}` — текстовый узел JSX, без `dangerouslySetInnerHTML`/
 * `innerHTML`/ручного DOM (тот же приём, что `VideoTile.jsx`/`ChatPanel.jsx`,
 * задачи 26/28).
 *
 * «В реальном времени» (F-16, US-9) обеспечивается не этим компонентом —
 * он презентационный, как `VideoGrid`/`VideoTile`/`RoomTopBar` (задачи
 * 25-27) — а `RoomScreen.jsx`: `participants` — React state, обновляемый
 * обработчиками `participant:joined`/`participant:left`/`media:state`
 * (Design §6.2); при каждом обновлении `RoomScreen` передаёт новый массив
 * сюда через props, и React перерисовывает список.
 *
 * Requirements: F-16, US-9. Design: §4.2, §6.2.
 */

/* eslint-disable react/prop-types -- проект типизирует пропсы JSDoc-аннотациями
   (см. VideoGrid.jsx/VideoTile.jsx/ChatPanel.jsx/RoomTopBar.jsx), PropTypes не
   подключена (Design §3.2/§10.5 SEC-19). */

/**
 * @param {object} props
 * @param {Array<{id: string, name: string, media?: {audio?: boolean, video?: boolean}}>} [props.participants]
 *   — снимок состава комнаты (Design §5.3/§6.2 `join:ok.participants`,
 *   обновляется `participant:joined`/`participant:left`), включает self.
 * @param {string} [props.selfId] — id самого себя (Design §6.2 `join:ok.selfId`),
 *   для пометки своей строки в списке (тот же приём, что `VideoTile`/`ChatPanel`).
 */
function ParticipantList({ participants = [], selfId }) {
  return (
    <ul className="participant-list" data-testid="participant-list">
      {participants.map((participant) => (
        <li
          className="participant-list-item"
          data-testid="participant-list-item"
          data-participant-id={participant.id}
          data-self={participant.id === selfId ? 'true' : 'false'}
          key={participant.id}
        >
          <span className="participant-list-name" data-testid="participant-list-name">
            {participant.name}
            {participant.id === selfId ? ' (я)' : ''}
          </span>
          {participant.media?.audio === false ? (
            <span
              className="participant-list-mic-off"
              data-testid="participant-list-mic-off"
              role="img"
              aria-label="Микрофон выключен"
            >
              🔇
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/* eslint-enable react/prop-types */

export default ParticipantList;
