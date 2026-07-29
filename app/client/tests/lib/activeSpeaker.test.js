import { describe, it, expect } from 'vitest';
import { computeActiveSpeakerId } from '../../src/lib/activeSpeaker.js';

/**
 * Задача 39 — `activeSpeakerId`-эвристика без VAD (design addendum §5.1).
 *
 * Критерий приёмки (`impl-video-chat-room.md`, задача 39): «тест эвристики —
 * join/leave меняют `activeSpeakerId` предсказуемо (первый чужой, иначе
 * self)».
 */

describe('computeActiveSpeakerId (design addendum §5.1)', () => {
  it('возвращает id первого участника в списке, кроме self', () => {
    const participants = [
      { id: 'self-1' },
      { id: 'peer-1' },
      { id: 'peer-2' },
    ];
    expect(computeActiveSpeakerId(participants, 'self-1')).toBe('peer-1');
  });

  it('self не первый в массиве — всё равно берётся первый НЕ-self элемент по порядку массива', () => {
    const participants = [
      { id: 'peer-1' },
      { id: 'self-1' },
      { id: 'peer-2' },
    ];
    expect(computeActiveSpeakerId(participants, 'self-1')).toBe('peer-1');
  });

  it('только self в комнате — возвращает self', () => {
    const participants = [{ id: 'self-1' }];
    expect(computeActiveSpeakerId(participants, 'self-1')).toBe('self-1');
  });

  it('пустой список участников — возвращает null (до join:ok)', () => {
    expect(computeActiveSpeakerId([], 'self-1')).toBeNull();
    expect(computeActiveSpeakerId([], null)).toBeNull();
  });

  it('join нового участника не меняет уже выбранного активного (первый чужой остаётся первым по порядку массива)', () => {
    const before = [{ id: 'self-1' }, { id: 'peer-1' }];
    expect(computeActiveSpeakerId(before, 'self-1')).toBe('peer-1');

    const afterJoin = [...before, { id: 'peer-2' }];
    expect(computeActiveSpeakerId(afterJoin, 'self-1')).toBe('peer-1');
  });

  it('leave активного участника переключает на следующего чужого по порядку массива', () => {
    const before = [{ id: 'self-1' }, { id: 'peer-1' }, { id: 'peer-2' }];
    expect(computeActiveSpeakerId(before, 'self-1')).toBe('peer-1');

    const afterLeave = before.filter((p) => p.id !== 'peer-1');
    expect(computeActiveSpeakerId(afterLeave, 'self-1')).toBe('peer-2');
  });

  it('leave последнего чужого возвращает эвристику на self', () => {
    const before = [{ id: 'self-1' }, { id: 'peer-1' }];
    const afterLeave = before.filter((p) => p.id !== 'peer-1');
    expect(computeActiveSpeakerId(afterLeave, 'self-1')).toBe('self-1');
  });

  it('selfId не передан (null/undefined) — берёт первого участника массива как "чужого"', () => {
    const participants = [{ id: 'p1' }, { id: 'p2' }];
    expect(computeActiveSpeakerId(participants)).toBe('p1');
    expect(computeActiveSpeakerId(participants, null)).toBe('p1');
  });
});
