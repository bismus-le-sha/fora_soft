/**
 * Комната — участники (Map<socketId, Participant>) + история чата
 * (ring-buffer, cap `HISTORY_MAX`). Живёт только в RAM (без БД).
 *
 * Requirements: F-05, F-09, F-16, F-30, SEC-09. Design: §5.1, §5.2.
 */

import { HISTORY_MAX, ROOM_CAPACITY } from '../config.js';

export class Room {
  /** @param {string} id - roomId (crypto.randomUUID, SEC-14). */
  constructor(id) {
    this.id = id;
    /** @type {Map<string, import('./Participant.js').Participant>} */
    this.participants = new Map();
    /** @type {object[]} ring-buffer сообщений, cap = HISTORY_MAX (SEC-09). */
    this.history = [];
    this.createdAt = Date.now();
  }

  /** @param {import('./Participant.js').Participant} participant */
  add(participant) {
    this.participants.set(participant.id, participant);
  }

  /**
   * @param {string} id - socket.id участника.
   * @returns {boolean} true, если участник был удалён.
   */
  remove(id) {
    return this.participants.delete(id);
  }

  /** @returns {number} текущее число участников. */
  size() {
    return this.participants.size;
  }

  /** @returns {boolean} комната заполнена (ROOM_CAPACITY, F-05). */
  isFull() {
    return this.participants.size >= ROOM_CAPACITY;
  }

  /**
   * Добавляет сообщение в историю; при превышении `HISTORY_MAX` вытесняет
   * самое старое (ring-buffer, SEC-09).
   * @param {object} message
   */
  pushMessage(message) {
    this.history.push(message);
    if (this.history.length > HISTORY_MAX) {
      this.history.shift();
    }
  }

  /** Полностью очищает состояние комнаты (участники + история). SEC-11. */
  clear() {
    this.participants.clear();
    this.history.length = 0;
  }

  /**
   * Снимок состояния для `join:ok` (§6.2): текущие участники + история чата.
   * @returns {{participants: object[], history: object[]}}
   */
  snapshot() {
    return {
      participants: Array.from(this.participants.values()).map((p) => p.toSnapshot()),
      history: [...this.history],
    };
  }
}

export default Room;
