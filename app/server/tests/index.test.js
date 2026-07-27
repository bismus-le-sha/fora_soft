import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app, httpServer, createApp } from '../src/index.js';
import { listenEphemeral } from './helpers/http.js';

describe('scaffold: server entry point', () => {
  it('exports an Express app', () => {
    expect(typeof app.listen).toBe('function');
  });

  it('exports the underlying http server (not auto-started under NODE_ENV=test)', () => {
    expect(httpServer.listening).toBe(false);
  });
});

/** Поднимает `createApp(deps)` на эфемерном порту и возвращает базовый URL. */
async function startApp(deps) {
  const testApp = createApp(deps);
  const server = createServer(testApp);
  const { url } = await listenEphemeral(server, '127.0.0.1');
  return { server, url };
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

  it('createApp без registry (null/undefined) бросает понятную ошибку, а не падает на первом запросе к /healthz', () => {
    expect(() => createApp({ registry: null })).toThrow(/registry/i);
    expect(() => createApp({})).toThrow(/registry/i);
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
    // isProduction=false не читает clientDistDir вообще — намеренно не
    // передаём его здесь, чтобы не вводить в заблуждение мёртвым сетапом.
    const fakeRegistry = { count: () => 0 };
    ctx = await startApp({ registry: fakeRegistry, isProduction: false });

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

  it('в проде отсутствующий index.html на SPA-фолбэке отдаёт 500 без стектрейса/абсолютного пути (без утечки, SEC-15/16)', async () => {
    // Фикстура БЕЗ index.html — sendFile должен упасть с ENOENT.
    distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcr-dist-empty-'));
    const fakeRegistry = { count: () => 0 };
    ctx = await startApp({ registry: fakeRegistry, clientDistDir: distDir, isProduction: true });

    const res = await fetch(`${ctx.url}/room/some-uuid`);
    const body = await res.text();

    expect(res.status).toBe(500);
    expect(body).not.toContain(distDir);
    expect(body.toLowerCase()).not.toContain('enoent');
    expect(body.toLowerCase()).not.toContain('at sendfile');
  });
});

describe('createApp — secure-заголовки (SEC-04/13, wiring задача 15)', () => {
  /** @type {{server: import('node:http').Server} | undefined} */
  let ctx;

  afterEach(async () => {
    if (ctx) {
      await new Promise((resolve) => ctx.server.close(resolve));
      ctx = undefined;
    }
  });

  it('/healthz отдаётся с secure-заголовками (CSP/nosniff/Referrer-Policy/X-Frame-Options)', async () => {
    const fakeRegistry = { count: () => 0 };
    ctx = await startApp({ registry: fakeRegistry });

    const res = await fetch(`${ctx.url}/healthz`);

    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
  });

  it('статика клиента (проде) отдаётся с теми же secure-заголовками', async () => {
    const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcr-dist-headers-'));
    fs.writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><div id="app"></div>');
    fs.writeFileSync(path.join(distDir, 'app.js'), 'console.log("asset");');
    try {
      const fakeRegistry = { count: () => 0 };
      ctx = await startApp({ registry: fakeRegistry, clientDistDir: distDir, isProduction: true });

      const res = await fetch(`${ctx.url}/app.js`);

      expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    } finally {
      fs.rmSync(distDir, { recursive: true, force: true });
    }
  });
});
