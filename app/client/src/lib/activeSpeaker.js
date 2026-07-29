/**
 * Picks the active speaker from the current participant snapshot.
 *
 * If somebody is actually speaking, keep the room-order winner among those ids.
 * If nobody is speaking and the room has more than one participant, there is no
 * featured speaker and the UI can fall back to an even grid.
 * If the room has only one participant, keep that single tile as the stage.
 *
 * @param {Array<{id: string}>} participants
 * @param {string | null} [selfId]
 * @param {string[]} [speakingParticipantIds]
 * @returns {string | null}
 */
export function computeActiveSpeakerId(participants, selfId = null, speakingParticipantIds = []) {
  for (const participant of participants) {
    if (speakingParticipantIds.includes(participant.id)) {
      return participant.id;
    }
  }

  if (participants.length === 1) {
    return participants[0]?.id ?? selfId;
  }

  return null;
}
