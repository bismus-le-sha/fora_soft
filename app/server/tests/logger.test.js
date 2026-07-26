import { describe, it, expect, vi, afterEach } from 'vitest';
import { log } from '../src/logger.js';

describe('logger (SEC-16; Design §10.4)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('логирует допустимый вызов (eventType + roomId + socketId) без ошибки', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const entry = log('join', { roomId: 'a1b2c3d4-e5f6-4789-a0b1-c2d3e4f5a6b7', socketId: 'sock-1' });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(entry.event).toBe('join');
    expect(entry.socketId).toBe('sock-1');
  });

  it('roomId в выводе НЕ равен исходному значению — усечён/хеширован', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const rawRoomId = 'a1b2c3d4-e5f6-4789-a0b1-c2d3e4f5a6b7';
    const entry = log('join', { roomId: rawRoomId });

    expect(entry.roomId).not.toBe(rawRoomId);
    expect(entry.roomId.length).toBeLessThan(rawRoomId.length);
    const loggedText = spy.mock.calls[0][0];
    expect(loggedText).not.toContain(rawRoomId);
  });

  it('хеш roomId детерминирован — одинаковый вход даёт одинаковый вывод (корреляция логов)', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const roomId = 'room-fixed-id';
    const first = log('join', { roomId });
    const second = log('leave', { roomId });

    expect(first.roomId).toBe(second.roomId);
  });

  it('разные roomId дают разный хеш (не всегда одна константа)', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const a = log('join', { roomId: 'room-aaaa' });
    const b = log('join', { roomId: 'room-bbbb' });

    expect(a.roomId).not.toBe(b.roomId);
  });

  it('без fields (только eventType) логирует без ошибки', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const entry = log('rate-limited');

    expect(spy).toHaveBeenCalledTimes(1);
    expect(entry).toEqual({ event: 'rate-limited' });
  });

  it('eventType не строка/пустая строка → throw, ничего не логируется', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(() => log('')).toThrow(TypeError);
    expect(() => log(undefined)).toThrow(TypeError);
    expect(() => log(42)).toThrow(TypeError);
    expect(spy).not.toHaveBeenCalled();
  });

  describe('запрещённые поля отклоняются (allow-list, не blacklist)', () => {
    const forbiddenCases = [
      ['message', { message: 'привет всем' }],
      ['text', { text: 'текст сообщения чата' }],
      ['name', { name: 'Иван Иванов' }],
      ['participantName', { participantName: 'Иван' }],
      ['sdp', { sdp: 'v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\n...' }],
      ['candidate', { candidate: 'candidate:1 1 UDP 2122252543 10.0.0.5 54321 typ host' }],
      ['ip', { ip: '203.0.113.42' }],
      ['ipAddress', { ipAddress: '203.0.113.42' }],
    ];

    it.each(forbiddenCases)('поле "%s" вызывает throw и ничего не логируется', (_label, fields) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      expect(() => log('chat:send', fields)).toThrow(TypeError);
      expect(spy).not.toHaveBeenCalled();
    });

    it('смешанный вызов (допустимое + запрещённое поле) целиком отклоняется', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      expect(() =>
        log('chat:send', { roomId: 'room-1', socketId: 's1', text: 'секретный текст' }),
      ).toThrow(TypeError);
      expect(spy).not.toHaveBeenCalled();
    });

    it('сообщение об ошибке называет поле по имени, но не содержит переданное PII-значение', () => {
      try {
        log('chat:send', { text: 'МОЙ_СЕКРЕТНЫЙ_ТЕКСТ' });
        throw new Error('expected TypeError not thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(TypeError);
        expect(err.message).toContain('text');
        expect(err.message).not.toContain('МОЙ_СЕКРЕТНЫЙ_ТЕКСТ');
      }
    });
  });

  describe('защита от протаскивания PII через допустимые ключи', () => {
    it('roomId нестроковым значением (объект с name внутри) → throw', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      expect(() => log('join', { roomId: { id: 'room-1', name: 'секрет' } })).toThrow(TypeError);
      expect(spy).not.toHaveBeenCalled();
    });

    it('socketId нестроковым значением (объект-участник с name внутри) → throw', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      expect(() =>
        log('join', { socketId: { id: 'sock-1', name: 'Иван Иванов' } }),
      ).toThrow(TypeError);
      expect(spy).not.toHaveBeenCalled();
    });

    it('пустая строка roomId/socketId отклоняется', () => {
      expect(() => log('join', { roomId: '' })).toThrow(TypeError);
      expect(() => log('join', { socketId: '' })).toThrow(TypeError);
    });

    it('fields массивом или null отклоняется', () => {
      expect(() => log('join', [])).toThrow(TypeError);
      expect(() => log('join', null)).toThrow(TypeError);
    });
  });
});
