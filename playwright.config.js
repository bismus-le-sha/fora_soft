import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E-smoke конфигурация (задача 32, Design §11.1/§11.4).
 *
 * Design §11.1: «E2E | Playwright (fake media:
 * `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`;
 * несколько browser-context для многопользовательских WebRTC-сценариев) |
 * вход по ссылке, 2-местный звонок, чат, toggle cam/mic, room-full, обрыв».
 *
 * Топология поднятия сквозного приложения (Design §12.2 dev-строка таблицы:
 * «Vite dev-server (HMR), proxy на сервер» + «node src/index.js (nodemon)» на
 * `localhost`): переиспользуем существующие dev-скрипты монорепо
 * (`npm run dev:server`/`npm run dev:client`, корневой `package.json`) вместо
 * отдельной прод-сборки — минимально инвазивно для существующей структуры
 * (никакой новой топологии специально для тестов). Два отдельных
 * `webServer`-процесса (а не один общий `npm run dev`) дают каждому свою
 * детерминированную проверку готовности (`url`) — сервер считается готовым по
 * `/healthz` (Design §12.4), клиент — по корню Vite dev-сервера; так нет гонки
 * «Vite уже отвечает, но прокси на ещё не поднявшийся Node возвращает 500».
 *
 * `ALLOWED_ORIGIN` (server `config.js`) по умолчанию — `http://127.0.0.1:5173`
 * (совпадает с хостом/портом Vite dev-сервера по умолчанию, см.
 * `vite.config.js`, который слушает `127.0.0.1` явно) — поэтому `baseURL`
 * ниже нарочно `http://127.0.0.1:5173` (не `localhost`), чтобы браузерный
 * `Origin` совпадал с CORS/`allowRequest`-проверкой gateway (SEC-15,
 * `socket/gateway.js`) без дополнительных env-переменных.
 *
 * Fake-media флаги Chromium (`--use-fake-device-for-media-stream`/
 * `--use-fake-ui-for-media-stream`) эмулируют камеру/микрофон и автоматически
 * подтверждают permission-prompt `getUserMedia` — тесты идут headless в CI
 * без реального железа (критерий приёмки задачи 32).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }], ['list']] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
        },
      },
    },
  ],
  webServer: [
    {
      command: 'npm run dev:server',
      url: 'http://127.0.0.1:3001/healthz',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'npm run dev:client',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
