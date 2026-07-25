import { describe, it, expect } from 'vitest';
import { Participant } from '../../src/domain/Participant.js';

describe('domain/Participant (F-05, F-09, F-16, F-30, SEC-06, Design §5.1)', () => {
  it('хранит id (=socket.id), имя и media, проставляет joinedAt', () => {
    const before = Date.now();
    const p = new Participant({ id: 'sock_1', name: 'Алекс' });
    const after = Date.now();

    expect(p.id).toBe('sock_1');
    expect(p.name).toBe('Алекс');
    expect(p.media).toEqual({ audio: true, video: true });
    expect(p.joinedAt).toBeGreaterThanOrEqual(before);
    expect(p.joinedAt).toBeLessThanOrEqual(after);
  });

  it('позволяет задать начальное состояние media явно', () => {
    const p = new Participant({ id: 'sock_2', name: 'Боб', media: { audio: false, video: true } });
    expect(p.media).toEqual({ audio: false, video: true });
  });

  it('toSnapshot() отдаёт { id, name, media } без внутренних полей', () => {
    const p = new Participant({ id: 'sock_3', name: 'Вера' });
    expect(p.toSnapshot()).toEqual({
      id: 'sock_3',
      name: 'Вера',
      media: { audio: true, video: true },
    });
  });

  it('toSnapshot() возвращает копию media (мутация снимка не влияет на участника)', () => {
    const p = new Participant({ id: 'sock_4', name: 'Глеб' });
    const snapshot = p.toSnapshot();
    snapshot.media.audio = false;
    expect(p.media.audio).toBe(true);
  });
});
