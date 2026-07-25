import { describe, it, expect } from 'vitest';
import { Room } from '../../src/domain/Room.js';
import { Participant } from '../../src/domain/Participant.js';
import { createChatMessage, createSystemMessage } from '../../src/domain/Message.js';
import { ROOM_CAPACITY, HISTORY_MAX } from '../../src/config.js';

function makeParticipant(id) {
  return new Participant({ id, name: `Участник ${id}` });
}

describe('domain/Room (F-05, F-09, F-16, F-30, SEC-09, Design §5.1, §5.2)', () => {
  it('add/remove/size управляют составом участников', () => {
    const room = new Room('room-1');
    expect(room.size()).toBe(0);

    room.add(makeParticipant('p1'));
    room.add(makeParticipant('p2'));
    expect(room.size()).toBe(2);

    const removed = room.remove('p1');
    expect(removed).toBe(true);
    expect(room.size()).toBe(1);

    const removedAgain = room.remove('p1');
    expect(removedAgain).toBe(false);
  });

  it(`isFull() ложно ниже ROOM_CAPACITY (${ROOM_CAPACITY}) и истинно при достижении лимита`, () => {
    const room = new Room('room-2');
    for (let i = 0; i < ROOM_CAPACITY - 1; i += 1) {
      room.add(makeParticipant(`p${i}`));
      expect(room.isFull()).toBe(false);
    }
    room.add(makeParticipant(`p${ROOM_CAPACITY - 1}`));
    expect(room.size()).toBe(ROOM_CAPACITY);
    expect(room.isFull()).toBe(true);
  });

  it('pushMessage сохраняет сообщения по порядку в пределах HISTORY_MAX', () => {
    const room = new Room('room-3');
    const m1 = createSystemMessage({ event: 'join', subjectName: 'A' });
    const m2 = createChatMessage({ authorId: 'p1', authorName: 'A', text: 'привет' });
    room.pushMessage(m1);
    room.pushMessage(m2);

    expect(room.history).toEqual([m1, m2]);
  });

  it(`pushMessage вытесняет старейшее сообщение сверх HISTORY_MAX (${HISTORY_MAX}) — ring-buffer, SEC-09`, () => {
    const room = new Room('room-4');
    for (let i = 0; i < HISTORY_MAX + 5; i += 1) {
      room.pushMessage(createChatMessage({ authorId: 'p1', authorName: 'A', text: `msg-${i}` }));
    }

    expect(room.history.length).toBe(HISTORY_MAX);
    // Первые 5 сообщений (msg-0..msg-4) должны быть вытеснены.
    expect(room.history[0].text).toBe('msg-5');
    expect(room.history[room.history.length - 1].text).toBe(`msg-${HISTORY_MAX + 4}`);
  });

  it('snapshot() отдаёт текущих участников и историю, независимо от внутреннего состояния', () => {
    const room = new Room('room-5');
    room.add(makeParticipant('p1'));
    room.pushMessage(createSystemMessage({ event: 'join', subjectName: 'Участник p1' }));

    const snapshot = room.snapshot();
    expect(snapshot.participants).toEqual([
      { id: 'p1', name: 'Участник p1', media: { audio: true, video: true } },
    ]);
    expect(snapshot.history).toHaveLength(1);

    // Мутация снимка не должна влиять на внутреннее состояние комнаты.
    snapshot.participants.push({ id: 'ghost' });
    snapshot.history.push('ghost');
    expect(room.size()).toBe(1);
    expect(room.history).toHaveLength(1);
  });

  it('clear() полностью очищает участников и историю (SEC-11)', () => {
    const room = new Room('room-6');
    room.add(makeParticipant('p1'));
    room.pushMessage(createChatMessage({ authorId: 'p1', authorName: 'A', text: 'hi' }));

    room.clear();

    expect(room.size()).toBe(0);
    expect(room.history).toHaveLength(0);
    expect(room.snapshot()).toEqual({ participants: [], history: [] });
  });
});
