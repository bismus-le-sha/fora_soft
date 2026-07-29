import { describe, it, expect } from 'vitest';
import { computeActiveSpeakerId } from '../../src/lib/activeSpeaker.js';

describe('computeActiveSpeakerId', () => {
  it('returns the first speaking participant in room order', () => {
    const participants = [{ id: 'self-1' }, { id: 'peer-1' }, { id: 'peer-2' }];
    expect(computeActiveSpeakerId(participants, 'self-1', ['peer-2', 'peer-1'])).toBe('peer-1');
  });

  it('allows self to become active if self is the one speaking', () => {
    const participants = [{ id: 'self-1' }, { id: 'peer-1' }];
    expect(computeActiveSpeakerId(participants, 'self-1', ['self-1'])).toBe('self-1');
  });

  it('returns null when nobody is speaking and there is more than one participant', () => {
    const participants = [{ id: 'self-1' }, { id: 'peer-1' }];
    expect(computeActiveSpeakerId(participants, 'self-1', [])).toBeNull();
  });

  it('keeps the single participant on stage for a one-person room', () => {
    const participants = [{ id: 'self-1' }];
    expect(computeActiveSpeakerId(participants, 'self-1', [])).toBe('self-1');
  });

  it('returns null for an empty room', () => {
    expect(computeActiveSpeakerId([], 'self-1', [])).toBeNull();
  });
});
