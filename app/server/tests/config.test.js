import { describe, it, expect } from 'vitest';
import * as config from '../src/config.js';

describe('config: единый источник лимитов (TDD §9.3)', () => {
  it('PORT — положительное число', () => {
    expect(typeof config.PORT).toBe('number');
    expect(Number.isInteger(config.PORT)).toBe(true);
    expect(config.PORT).toBeGreaterThan(0);
  });

  it('NAME_MAX = 30 (SEC-01, F-38)', () => {
    expect(config.NAME_MAX).toBe(30);
  });

  it('MESSAGE_MAX = 500 (SEC-02/08)', () => {
    expect(config.MESSAGE_MAX).toBe(500);
  });

  it('HISTORY_MAX = 200 (SEC-09)', () => {
    expect(config.HISTORY_MAX).toBe(200);
  });

  it('ROOM_CAPACITY = 4 (F-05)', () => {
    expect(config.ROOM_CAPACITY).toBe(4);
  });

  it('ROOMS_MAX = 1000 (SEC-10)', () => {
    expect(config.ROOMS_MAX).toBe(1000);
  });

  it('MAX_HTTP_BUFFER_SIZE = 65536 байт / 64KB (SEC-08)', () => {
    expect(config.MAX_HTTP_BUFFER_SIZE).toBe(65536);
  });

  it('RATE_LIMIT содержит лимиты chat/signal/join с ожидаемыми значениями (SEC-05)', () => {
    expect(config.RATE_LIMIT.chat).toEqual({ points: 5, durationMs: 2000 });
    expect(config.RATE_LIMIT.signal).toEqual({ points: 50, durationMs: 1000 });
    expect(config.RATE_LIMIT.join).toEqual({ points: 5, durationMs: 10000 });
  });

  it('RATE_LIMIT и вложенные категории заморожены (защита от случайной мутации)', () => {
    expect(Object.isFrozen(config.RATE_LIMIT)).toBe(true);
    expect(Object.isFrozen(config.RATE_LIMIT.chat)).toBe(true);
    expect(Object.isFrozen(config.RATE_LIMIT.signal)).toBe(true);
    expect(Object.isFrozen(config.RATE_LIMIT.join)).toBe(true);
  });

  it('ICE_SERVERS — непустой массив публичных STUN-серверов, без TURN-учётных данных (F-34, SEC-17)', () => {
    expect(Array.isArray(config.ICE_SERVERS)).toBe(true);
    expect(config.ICE_SERVERS.length).toBeGreaterThan(0);
    for (const server of config.ICE_SERVERS) {
      expect(typeof server.urls).toBe('string');
      expect(server.urls.startsWith('stun:')).toBe(true);
      // Нет учётных данных TURN (username/credential) — по архитектуре без TURN.
      expect(server).not.toHaveProperty('username');
      expect(server).not.toHaveProperty('credential');
    }
    expect(Object.isFrozen(config.ICE_SERVERS)).toBe(true);
  });

  it('ALLOWED_ORIGIN — непустая строка, читается из env (SEC-15)', () => {
    expect(typeof config.ALLOWED_ORIGIN).toBe('string');
    expect(config.ALLOWED_ORIGIN.length).toBeGreaterThan(0);
  });

  it('в конфиге нет секретов/ключей (эвристика по именам экспортов)', () => {
    const forbiddenNamePattern = /secret|password|token|apikey|api_key|private[_-]?key/i;
    for (const exportName of Object.keys(config)) {
      expect(exportName).not.toMatch(forbiddenNamePattern);
    }
  });
});
