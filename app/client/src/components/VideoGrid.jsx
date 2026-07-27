/**
 * VideoGrid — адаптивная сетка 1–4 плитки участников (задача 25).
 *
 * Design §4.2 (дерево компонентов клиента): `VideoGrid.jsx` рендерит раскладку
 * участников; сосед по дереву — `VideoTile.jsx` (задача 26, ещё не существует
 * — здесь плитка временно инлайновая, как раньше в `RoomScreen.jsx`, задача 26
 * заменит содержимое плитки на реальный рендер видео/заглушки без изменения
 * контракта пропсов `VideoGrid`).
 *
 * Requirements: F-07, US-6.
 *
 * `ROOM_CAPACITY = 4` (Design §9 «Configuration») — участников не может быть
 * больше 4, поэтому раскладка определена ровно для 1/2/3/4: 1 — во весь экран,
 * 2 — два в ряд, 3/4 — сетка 2×2 (4-я ячейка при 3 участниках пустует за счёт
 * CSS `grid-template`, вёрстка самой CSS — вне скоупа этой задачи, здесь только
 * класс-хук `grid-count-N`, проверяемый в RTL-тесте).
 *
 * `participants` включает самого себя (Design §5.3/§6.2 `join:ok.participants`
 * не исключает self) — self определяется сравнением `participant.id === selfId`
 * (тот же приём, что был в инлайн-вёрстке `RoomScreen.jsx` до задачи 25).
 */

/* eslint-disable react/prop-types -- проект типизирует пропсы JSDoc-аннотациями
   (см. JoinGate.jsx/StartScreen.jsx/RoomScreen.jsx), PropTypes не подключена
   (Design §3.2/§10.5 SEC-19). */

/**
 * @param {object} props
 * @param {Array<{id: string, name: string, media?: {audio?: boolean, video?: boolean}}>} props.participants
 *   — снимок состава комнаты (Design §5.3), включает self.
 * @param {string} [props.selfId] — id самого себя (Design §6.2 `join:ok.selfId`),
 *   для пометки self-плитки.
 */
function VideoGrid({ participants, selfId }) {
  const count = participants.length;
  // Раскладка определена для 1..4 (ROOM_CAPACITY, Design §9); при отсутствии
  // участников (пограничный случай до `join:ok`) сетка пуста — класс не хуже
  // `grid-count-0`, чтобы не имитировать несуществующую раскладку.
  const gridCountClass = count > 0 ? `grid-count-${Math.min(count, 4)}` : 'grid-count-0';

  return (
    <div className={`video-grid ${gridCountClass}`} data-testid="video-grid" data-count={count}>
      {participants.map((participant) => {
        const isSelf = participant.id === selfId;
        return (
          <div
            key={participant.id}
            className="video-tile"
            data-testid="video-tile"
            data-participant-id={participant.id}
            data-self={isSelf ? 'true' : 'false'}
          >
            {participant.name}
            {isSelf ? ' (я)' : ''}
            {participant.media && participant.media.audio === false ? ' 🔇' : ''}
          </div>
        );
      })}
    </div>
  );
}

/* eslint-enable react/prop-types */

export default VideoGrid;
