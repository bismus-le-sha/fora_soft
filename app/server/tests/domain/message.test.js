import { describe, it, expect } from 'vitest';
import {
  createChatMessage,
  createSystemMessage,
  isChatMessage,
  isSystemMessage,
} from '../../src/domain/Message.js';

describe('domain/Message — discriminated union chat|system (SEC-06, SEC-09, Design §5.1)', () => {
  it('createChatMessage: kind="chat", авторство и текст ровно из параметров', () => {
    const msg = createChatMessage({ authorId: 'sock_1', authorName: 'Алекс', text: 'привет' });

    expect(msg.kind).toBe('chat');
    expect(typeof msg.id).toBe('string');
    expect(msg.id.length).toBeGreaterThan(0);
    expect(typeof msg.ts).toBe('number');
    expect(msg.authorId).toBe('sock_1');
    expect(msg.authorName).toBe('Алекс');
    expect(msg.text).toBe('привет');
  });

  it('createSystemMessage: kind="system", event и subjectName из параметров', () => {
    const msg = createSystemMessage({ event: 'join', subjectName: 'Боб' });

    expect(msg.kind).toBe('system');
    expect(typeof msg.id).toBe('string');
    expect(typeof msg.ts).toBe('number');
    expect(msg.event).toBe('join');
    expect(msg.subjectName).toBe('Боб');
  });

  it('id сообщений уникален', () => {
    const a = createChatMessage({ authorId: 'sock_1', authorName: 'A', text: 'x' });
    const b = createChatMessage({ authorId: 'sock_1', authorName: 'A', text: 'y' });
    expect(a.id).not.toBe(b.id);
  });

  it('isChatMessage/isSystemMessage корректно различают union по kind', () => {
    const chat = createChatMessage({ authorId: 's1', authorName: 'A', text: 'hi' });
    const system = createSystemMessage({ event: 'leave', subjectName: 'A' });

    expect(isChatMessage(chat)).toBe(true);
    expect(isChatMessage(system)).toBe(false);
    expect(isSystemMessage(system)).toBe(true);
    expect(isSystemMessage(chat)).toBe(false);
    expect(isChatMessage(null)).toBe(false);
    expect(isSystemMessage(undefined)).toBe(false);
  });
});
