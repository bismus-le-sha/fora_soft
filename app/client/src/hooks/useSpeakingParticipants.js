import { useEffect, useState } from 'react';

const ACTIVE_HOLD_MS = 1200;
const SAMPLE_INTERVAL_MS = 160;
const SPEECH_THRESHOLD = 0.05;

function getAudioContextCtor() {
  return globalThis.AudioContext ?? globalThis.webkitAudioContext ?? null;
}

function readLevel(analyser, data) {
  analyser.getByteTimeDomainData(data);
  let sum = 0;
  for (let index = 0; index < data.length; index += 1) {
    const value = (data[index] - 128) / 128;
    sum += value * value;
  }
  return Math.sqrt(sum / data.length);
}

export function useSpeakingParticipants(streamEntries) {
  const [speakingParticipantIds, setSpeakingParticipantIds] = useState([]);

  useEffect(() => {
    const AudioContextCtor = getAudioContextCtor();
    if (!AudioContextCtor || !Array.isArray(streamEntries) || streamEntries.length === 0) {
      setSpeakingParticipantIds([]);
      return undefined;
    }

    const contexts = [];
    const activeUntilById = new Map();

    for (const entry of streamEntries) {
      const stream = entry?.stream;
      const participantId = entry?.participantId;
      if (!participantId || typeof stream?.getAudioTracks !== 'function') {
        continue;
      }

      const audioTracks = stream.getAudioTracks().filter((track) => track.enabled && track.readyState === 'live');
      if (audioTracks.length === 0) {
        continue;
      }

      try {
        const context = new AudioContextCtor();
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.7;
        const source = context.createMediaStreamSource(stream);
        source.connect(analyser);
        contexts.push({
          participantId,
          context,
          analyser,
          data: new Uint8Array(analyser.fftSize),
        });
      } catch {
        // Ignore unsupported stream analyzers in tests/browsers.
      }
    }

    if (contexts.length === 0) {
      setSpeakingParticipantIds([]);
      return () => {};
    }

    const intervalId = globalThis.setInterval(() => {
      const now = Date.now();

      for (const item of contexts) {
        const level = readLevel(item.analyser, item.data);
        if (level >= SPEECH_THRESHOLD) {
          activeUntilById.set(item.participantId, now + ACTIVE_HOLD_MS);
        }
      }

      const nextSpeakingIds = [];
      for (const [participantId, activeUntil] of activeUntilById.entries()) {
        if (activeUntil > now) {
          nextSpeakingIds.push(participantId);
        } else {
          activeUntilById.delete(participantId);
        }
      }

      setSpeakingParticipantIds((prev) => {
        if (
          prev.length === nextSpeakingIds.length &&
          prev.every((participantId, index) => participantId === nextSpeakingIds[index])
        ) {
          return prev;
        }
        return nextSpeakingIds;
      });
    }, SAMPLE_INTERVAL_MS);

    return () => {
      globalThis.clearInterval(intervalId);
      setSpeakingParticipantIds([]);
      for (const item of contexts) {
        try {
          item.context.close?.();
        } catch {
          // Ignore teardown errors.
        }
      }
    };
  }, [streamEntries]);

  return speakingParticipantIds;
}

export default useSpeakingParticipants;
