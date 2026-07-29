/**
 * `activeSpeakerId`-эвристика без VAD (задача 39, design-ui addendum §5.1).
 *
 * Design addendum §5.1: дизайн вводит понятие «сцена = активный участник»
 * (`activeSpeakerId // кто на сцене: говорящий, иначе первый другой, иначе
 * вы», `design-handoff/README.md` → State Management). Настоящий voice-activity
 * detection сознательно вне объёма этого захода (addendum §5.1 — «Развилки,
 * которые пришлось решить»): эвристика — первый участник в списке, кроме
 * себя; если такого нет (комната из одного) — сам.
 *
 * `participants` приходит в порядке входа (`RoomScreen` кладёт новых
 * участников в конец массива, см. `onParticipantJoined` в `RoomScreen.jsx`),
 * поэтому смена активного участника при join/leave детерминирована самим
 * порядком массива — без отдельного состояния/эффекта в компоненте.
 *
 * Requirements: F-07. Design: addendum §5.1, §3 (`VideoGrid.jsx`).
 */

/**
 * @param {Array<{id: string}>} participants — снимок состава комнаты
 *   (Design §5.3), включает self.
 * @param {string | null} [selfId] — id самого себя (Design §6.2 `join:ok.selfId`).
 * @returns {string | null} id участника для сцены; `null`, если `participants`
 *   пуст (до `join:ok`).
 */
export function computeActiveSpeakerId(participants, selfId = null) {
  const other = participants.find((participant) => participant.id !== selfId);
  if (other) {
    return other.id;
  }
  return participants.length > 0 ? selfId : null;
}
