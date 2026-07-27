import { describe, it, expect } from 'vitest';
import * as config from '../src/config.js';

describe('config: клиентский ICE + URL сигналинга (TDD §4.2/§9.3, F-34, SEC-17)', () => {
  it('ICE_SERVERS — непустой массив публичных STUN-серверов, без TURN-учётных данных', () => {
    expect(Array.isArray(config.ICE_SERVERS)).toBe(true);
    expect(config.ICE_SERVERS.length).toBeGreaterThan(0);
    for (const server of config.ICE_SERVERS) {
      expect(typeof server.urls).toBe('string');
      expect(server.urls.startsWith('stun:')).toBe(true);
      expect(server).not.toHaveProperty('username');
      expect(server).not.toHaveProperty('credential');
    }
  });

  it('ICE_SERVERS содержит канонический Google STUN-endpoint stun.l.google.com:19302', () => {
    expect(config.ICE_SERVERS.some((s) => s.urls === 'stun:stun.l.google.com:19302')).toBe(true);
  });

  it('ICE_SERVERS и его элементы заморожены (защита от случайной мутации)', () => {
    expect(Object.isFrozen(config.ICE_SERVERS)).toBe(true);
    for (const server of config.ICE_SERVERS) {
      expect(Object.isFrozen(server)).toBe(true);
    }
  });

  it('SIGNALING_URL — строка (пустая = тот же origin, что и страница)', () => {
    expect(typeof config.SIGNALING_URL).toBe('string');
  });

  it('в конфиге нет секретов/ключей (эвристика по именам экспортов)', () => {
    const forbiddenNamePattern = /secret|password|token|apikey|api_key|private[_-]?key/i;
    for (const exportName of Object.keys(config)) {
      expect(exportName).not.toMatch(forbiddenNamePattern);
    }
  });
});
