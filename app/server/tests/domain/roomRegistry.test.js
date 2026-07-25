import { describe, it, expect } from 'vitest';
import { RoomRegistry } from '../../src/domain/RoomRegistry.js';
import { Room } from '../../src/domain/Room.js';
import { Participant } from '../../src/domain/Participant.js';
import { createChatMessage } from '../../src/domain/Message.js';
import { ROOMS_MAX } from '../../src/config.js';

describe('domain/RoomRegistry (F-05, F-09, SEC-09, SEC-10, Design §4.1, §5.2, §9.3)', () => {
  it('getOrCreate создаёт новую комнату при первом обращении к roomId', () => {
    const registry = new RoomRegistry();
    const result = registry.getOrCreate('room-a');

    expect(result.ok).toBe(true);
    expect(result.room).toBeInstanceOf(Room);
    expect(result.room.id).toBe('room-a');
    expect(registry.count()).toBe(1);
  });

  it('getOrCreate возвращает ту же комнату (по ссылке) при повторном обращении', () => {
    const registry = new RoomRegistry();
    const first = registry.getOrCreate('room-a');
    const second = registry.getOrCreate('room-a');

    expect(second.ok).toBe(true);
    expect(second.room).toBe(first.room);
    expect(registry.count()).toBe(1);
  });

  it('get() отдаёт существующую комнату или undefined', () => {
    const registry = new RoomRegistry();
    registry.getOrCreate('room-a');

    expect(registry.get('room-a')).toBeInstanceOf(Room);
    expect(registry.get('unknown')).toBeUndefined();
  });

  it('count() отражает текущее число комнат в реестре', () => {
    const registry = new RoomRegistry();
    expect(registry.count()).toBe(0);
    registry.getOrCreate('a');
    registry.getOrCreate('b');
    expect(registry.count()).toBe(2);
  });

  it('delete() удаляет комнату из реестра и очищает её историю/состояние (SEC-11)', () => {
    const registry = new RoomRegistry();
    const { room } = registry.getOrCreate('room-a');
    room.add(new Participant({ id: 'p1', name: 'Алекс' }));
    room.pushMessage(createChatMessage({ authorId: 'p1', authorName: 'Алекс', text: 'привет' }));

    const deleted = registry.delete('room-a');

    expect(deleted).toBe(true);
    expect(registry.get('room-a')).toBeUndefined();
    expect(registry.count()).toBe(0);
    // Ссылка на объект Room, полученная до удаления, тоже должна быть очищена —
    // никакая внешняя ссылка не должна «утекать» с данными комнаты.
    expect(room.size()).toBe(0);
    expect(room.snapshot()).toEqual({ participants: [], history: [] });
  });

  it('delete() для несуществующей комнаты не бросает исключение и возвращает false', () => {
    const registry = new RoomRegistry();
    expect(() => registry.delete('ghost')).not.toThrow();
    expect(registry.delete('ghost')).toBe(false);
  });

  it(
    `getOrCreate при достижении ROOMS_MAX (${ROOMS_MAX}) отказывает в создании НОВОЙ комнаты ` +
      'управляемым результатом, а не исключением (SEC-10)',
    () => {
      const registry = new RoomRegistry();
      for (let i = 0; i < ROOMS_MAX; i += 1) {
        const result = registry.getOrCreate(`room-${i}`);
        expect(result.ok).toBe(true);
      }
      expect(registry.count()).toBe(ROOMS_MAX);

      let result;
      expect(() => {
        result = registry.getOrCreate('one-too-many');
      }).not.toThrow();

      expect(result).toEqual({ ok: false, code: 'rooms-full' });
      expect(registry.count()).toBe(ROOMS_MAX);
      expect(registry.get('one-too-many')).toBeUndefined();
    },
  );

  it('getOrCreate на уже существующую комнату проходит даже при заполненном реестре (ROOMS_MAX)', () => {
    const registry = new RoomRegistry();
    for (let i = 0; i < ROOMS_MAX; i += 1) {
      registry.getOrCreate(`room-${i}`);
    }

    const result = registry.getOrCreate('room-0');
    expect(result.ok).toBe(true);
    expect(result.room.id).toBe('room-0');
  });
});
