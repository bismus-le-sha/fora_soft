/**
 * Эвристика сцены без VAD: первый участник кроме self, иначе self.
 *
 * @param {Array<{id: string}>} participants
 * @param {string | null} [selfId]
 * @returns {string | null}
 */
export function computeActiveSpeakerId(participants, selfId = null) {
  const other = participants.find((participant) => participant.id !== selfId);
  if (other) {
    return other.id;
  }
  return participants.length > 0 ? selfId : null;
}
