import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5173';
const outputDir = resolve('docs/screenshots');
const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
  ],
});

await mkdir(outputDir, { recursive: true });

const contextA = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  permissions: ['camera', 'microphone'],
});
const contextB = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  permissions: ['camera', 'microphone'],
});
const pageA = await contextA.newPage();
const pageB = await contextB.newPage();

try {
  await pageA.goto(baseUrl);
  await pageA.locator('#start-screen-name').fill('Алекс');
  await pageA.screenshot({ path: resolve(outputDir, '01-start.png') });

  await pageA.getByRole('button', { name: 'Создать комнату' }).click();
  await pageA.getByTestId('room-screen').waitFor();
  const roomUrl = pageA.url();

  await pageB.goto(roomUrl);
  await pageB.locator('#join-gate-name').fill('Мария');
  await pageB.screenshot({ path: resolve(outputDir, '02-join-by-link.png') });

  await pageB.getByRole('button', { name: 'Войти' }).click();
  await pageB.getByTestId('room-screen').waitFor();
  await pageA.getByTestId('participant-list-item').nth(1).waitFor({ state: 'attached' });
  await Promise.all([
    pageB.getByTestId('toggle-audio').click(),
    pageB.getByTestId('toggle-video').click(),
  ]);
  await pageA.locator('[data-testid="video-stage"] video').waitFor({ state: 'visible' });

  await pageA.getByTestId('chat-toggle-button').click();
  await pageA.getByTestId('chat-input').fill('Привет! Я уже в комнате 👋');
  await pageA.getByTestId('chat-send-button').click();
  await pageA.getByText('Привет! Я уже в комнате 👋').waitFor();
  await pageA.screenshot({ path: resolve(outputDir, '03-room-and-chat.png') });
} finally {
  await contextA.close();
  await contextB.close();
  await browser.close();
}
