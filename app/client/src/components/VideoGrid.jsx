import VideoTile from './VideoTile.jsx';

/**
 * VideoGrid — адаптивная сетка 1–4 плитки участников (задача 25).
 *
 * Design §4.2 (дерево компонентов клиента): `VideoGrid.jsx` рендерит раскладку
 * участников; каждая ячейка — `VideoTile.jsx` (задача 26): единица рендера
 * видео/заглушки/оверлея имени/mic-off вынесена в отдельный переиспользуемый
 * компонент, `VideoGrid` отвечает только за раскладку и не знает о деталях
 * содержимого плитки.
 *
 * `stream` в `VideoTile` здесь не передаётся (`undefined`) — `VideoGrid`
 * получает только `participants`/`selfId` (Design §5.3 снимок состава), без
 * `MediaStream`; подключение реальных потоков (`useMedia().localStream`/
 * `useMesh().remoteStreams`) к плиткам — вне контракта этого компонента,
 * `VideoTile` при отсутствии `stream` корректно показывает заглушку-силуэт
 * (F-14/F-18, см. JSDoc `VideoTile.jsx`).
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
      {participants.map((participant) => (
        <VideoTile
          key={participant.id}
          participant={participant}
          mediaState={participant.media ?? {}}
          isSelf={participant.id === selfId}
        />
      ))}
    </div>
  );
}

/* eslint-enable react/prop-types */

export default VideoGrid;
