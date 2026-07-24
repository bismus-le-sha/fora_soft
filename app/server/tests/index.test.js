import { describe, it, expect } from 'vitest';
import { app, httpServer } from '../src/index.js';

describe('scaffold: server entry point', () => {
  it('exports an Express app', () => {
    expect(typeof app.listen).toBe('function');
  });

  it('exports the underlying http server (not auto-started under NODE_ENV=test)', () => {
    expect(httpServer.listening).toBe(false);
  });
});
