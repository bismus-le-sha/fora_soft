/**
 * Реестр комнат в памяти сервера: создание по требованию, поиск, удаление
 * при опустении, cap на число одновременных комнат (`ROOMS_MAX`, SEC-10).
 *
 * `getOrCreate` НЕ бросает исключение при достижении лимита — по достижении
 * `ROOMS_MAX` создание НОВОЙ комнаты отклоняется управляемым результатом
 * `{ ok: false, code: 'rooms-full' }`, вызывающий код (`RoomService.join`,
 * задача 9) сам решает, как ответить клиенту (`join:rejected`). Уже
 * существующая комната всегда возвращается независимо от текущего
 * заполнения реестра (иначе штатный `join` в уже открытую комнату ломался
 * бы после достижения ROOMS_MAX).
 *
 * Requirements: F-05, F-09, SEC-09, SEC-10. Design: §4.1, §5.2, §9.3.
 */

import { Room } from './Room.js';
import { ROOMS_MAX } from '../config.js';

export class RoomRegistry {
  constructor() {
    /** @type {Map<string, Room>} */
    this.rooms = new Map();
  }

  /**
   * Возвращает существующую комнату либо создаёт новую (если не достигнут
   * `ROOMS_MAX`).
   * @param {string} roomId
   * @returns {{ok: true, room: Room} | {ok: false, code: 'rooms-full'}}
   */
  getOrCreate(roomId) {
    const existing = this.rooms.get(roomId);
    if (existing) {
      return { ok: true, room: existing };
    }
    if (this.rooms.size >= ROOMS_MAX) {
      return { ok: false, code: 'rooms-full' };
    }
    const room = new Room(roomId);
    this.rooms.set(roomId, room);
    return { ok: true, room };
  }

  /**
   * @param {string} roomId
   * @returns {Room | undefined}
   */
  get(roomId) {
    return this.rooms.get(roomId);
  }

  /**
   * Удаляет комнату из реестра и очищает её состояние (участники, история —
   * SEC-11, защита от утечки данных дольше, чем существует комната).
   * @param {string} roomId
   * @returns {boolean} true, если комната существовала и была удалена.
   */
  delete(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return false;
    }
    room.clear();
    return this.rooms.delete(roomId);
  }

  /** @returns {number} текущее число комнат в реестре. */
  count() {
    return this.rooms.size;
  }
}

export default RoomRegistry;
