import { describe, it, expect } from 'vitest';
import { computeActiveSpeakerId } from '../../src/lib/activeSpeaker.js';

describe('computeActiveSpeakerId', () => {
  it('returns the first participant other than self', () => {
    const participants = [{ id: 'self-1' }, { id: 'peer-1' }, { id: 'peer-2' }];
    expect(computeActiveSpeakerId(participants, 'self-1')).toBe('peer-1');
  });

  it('keeps the single participant on stage for a one-person room', () => {
    const participants = [{ id: 'self-1' }];
    expect(computeActiveSpeakerId(participants, 'self-1')).toBe('self-1');
  });

  it('returns null for an empty room', () => {
    expect(computeActiveSpeakerId([], 'self-1')).toBeNull();
  });
});
