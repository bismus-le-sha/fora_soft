import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app, httpServer, createApp } from '../src/index.js';

describe('scaffold: server entry point', () => {
  it('exports an Express app', () => {
    expect(typeof app.listen).toBe('function');
  });

  it('exports the underlying http server (not auto-started under NODE_ENV=test)', () => {
    expect(httpServer.listening).toBe(false);
  });
});

/** Поднимает `createApp(deps)` на эфемерном порту и возвращает базовый URL. */
function startApp(deps) {
  const testApp = createApp(deps);
  const server = createServer(testApp);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

describe('createApp — /healthz (Design §12.4, без PII)', () => {
  /** @type {{server: import('node:http').Server} | undefined} */
  let ctx;

  afterEach(async () => {
    if (ctx) {
      await new Promise((resolve) => ctx.server.close(resolve));
      ctx = undefined;
    }
  });

  it('createApp — фабрика, возвращает Express-приложение', () => {
    const fakeRegistry = { count: () => 0 };
    const testApp = createApp({ registry: fakeRegistry });
    expect(typeof testApp.listen).toBe('function');
  });

  it('GET /healthz -> 200 {status:"ok", rooms: registry.count()}', async () => {
    const fakeRegistry = { count: () => 2 };
    ctx = await startApp({ registry: fakeRegistry });

    const res = await fetch(`${ctx.url}/healthz`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: 'ok', rooms: 2 });
  });

  it('rooms в ответе отражает актуальное состояние registry (не закэшировано на старте)', async () => {
    let count = 0;
    const fakeRegistry = { count: () => count };
    ctx = await startApp({ registry: fakeRegistry });

    const before = await (await fetch(`${ctx.url}/healthz`)).json();
    expect(before.rooms).toBe(0);

    count = 5;
    const after = await (await fetch(`${ctx.url}/healthz`)).json();
    expect(after.rooms).toBe(5);
  });

  it('ответ не содержит полей помимо status/rooms (без PII)', async () => {
    const fakeRegistry = { count: () => 0 };
    ctx = await startApp({ registry: fakeRegistry });

    const body = await (await fetch(`${ctx.url}/healthz`)).json();
    expect(Object.keys(body).sort()).toEqual(['rooms', 'status']);
  });
});

describe('createApp — раздача статики клиента (Design §3.2/§12.2, SEC-12/15)', () => {
  /** @type {{server: import('node:http').Server} | undefined} */
  let ctx;
  /** @type {string | undefined} */
  let distDir;

  afterEach(async () => {
    if (ctx) {
      await new Promise((resolve) => ctx.server.close(resolve));
      ctx = undefined;
    }
    if (distDir) {
      fs.rmSync(distDir, { recursive: true, force: true });
      distDir = undefined;
    }
  });

  function makeFixtureDist() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcr-dist-'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><div id="app"></div>');
    fs.writeFileSync(path.join(dir, 'app.js'), 'console.log("asset");');
    return dir;
  }

  it('вне прода (isProduction=false) статика НЕ раздаётся — не мешает Vite dev-серверу', async () => {
    distDir = makeFixtureDist();
    const fakeRegistry = { count: () => 0 };
    ctx = await startApp({ registry: fakeRegistry, clientDistDir: distDir, isProduction: false });

    const res = await fetch(`${ctx.url}/app.js`);
    expect(res.status).toBe(404);
  });

  it('в проде (isProduction=true) статические файлы отдаются из clientDistDir', async () => {
    distDir = makeFixtureDist();
    const fakeRegistry = { count: () => 0 };
    ctx = await startApp({ registry: fakeRegistry, clientDistDir: distDir, isProduction: true });

    const res = await fetch(`${ctx.url}/app.js`);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toContain('console.log("asset")');
  });

  it('в проде неизвестный путь (клиентский роутинг, напр. /room/:id) получает index.html (SPA-фолбэк)', async () => {
    distDir = makeFixtureDist();
    const fakeRegistry = { count: () => 0 };
    ctx = await startApp({ registry: fakeRegistry, clientDistDir: distDir, isProduction: true });

    const res = await fetch(`${ctx.url}/room/some-uuid`);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toContain('<div id="app"></div>');
  });

  it('в проде /healthz остаётся приоритетнее SPA-фолбэка', async () => {
    distDir = makeFixtureDist();
    const fakeRegistry = { count: () => 7 };
    ctx = await startApp({ registry: fakeRegistry, clientDistDir: distDir, isProduction: true });

    const res = await fetch(`${ctx.url}/healthz`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: 'ok', rooms: 7 });
  });
});
