import { expect } from '@playwright/test';

/**
 * Общие хелперы для E2E-smoke (задача 32, Design §11.1/§11.4).
 *
 * Каждый хелпер опирается на реальную разметку/`data-testid`, зафиксированные
 * предыдущими задачами (StartScreen — задача 19, JoinGate — задача 20,
 * RoomScreen/VideoGrid/ControlBar/ParticipantList/ChatPanel — задачи 24-29):
 * никакого отдельного тестового API на клиенте не заводится — сценарии
 * управляют приложением так же, как реальный пользователь (клик/ввод),
 * fake-media эмулирует камеру/микрофон (Chromium-флаги в `playwright.config.js`).
 */

/**
 * StartScreen → «Создать комнату» → JoinGate → «Войти» (Design §6.4/§7.1).
 * US-1/US-2: создание комнаты генерирует `roomId` и переводит на `/room/:id`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 * @returns {Promise<{roomId: string, roomUrl: string}>}
 */
export async function createRoom(page, name) {
  await page.goto('/');
  await page.locator('#start-screen-name').fill(name);
  await page.getByRole('button', { name: 'Создать комнату' }).click();

  await page.waitForURL(/\/room\/[^/]+\/?$/);
  const roomUrl = page.url();
  const roomId = new URL(roomUrl).pathname.split('/room/')[1];

  const roomScreen = page.getByTestId('room-screen');
  await expect(roomScreen).toBeVisible({ timeout: 20_000 });

  return { roomId, roomUrl };
}

/**
 * Вход по прямой ссылке `/room/:roomId` (US-4 «вход по ссылке») — минуя
 * StartScreen, сразу на JoinGate (Design §6.4: `App.jsx` рендерит `JoinGate`
 * напрямую для любого `/room/:id`, независимо от истории навигации).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} roomUrl
 * @param {string} name
 * @returns {Promise<void>}
 */
export async function joinRoomByUrl(page, roomUrl, name) {
  await page.goto(roomUrl);
  await enterJoinGate(page, name);
}

/**
 * JoinGate: ввод имени + клик «Войти» (user-gesture → `getUserMedia` fake →
 * `onJoin`) → ожидание рендера `RoomScreen` (Design §7.1).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
async function enterJoinGate(page, name) {
  await page.locator('#join-gate-name').fill(name);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByTestId('room-screen')).toBeVisible();
}

/**
 * Ждёт, пока список участников (`ParticipantList`, F-16/US-9) не достигнет
 * ожидаемого размера — общий снимок состава комнаты глазами одной страницы.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} count
 */
export async function waitForParticipantCount(page, count) {
  await expect(page.getByTestId('participant-list-item')).toHaveCount(count);
}

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>} имена участников (тем же порядком, что рендерит `ParticipantList`).
 */
export async function participantNames(page) {
  return page.getByTestId('participant-list-name').allTextContents();
}

/**
 * Открывает сворачиваемую панель Чат/Участники (задача 41, `ChatSidePanel.jsx`,
 * `RoomTopBar.jsx` кнопка «Чат») — по умолчанию закрыта (README §5), клик
 * всегда открывает её на вкладке «Чат» (`RoomScreen.handleToggleChat`).
 * Идемпотентна — если панель уже открыта, повторный клик её закроет, поэтому
 * сначала проверяем `aria-pressed`.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function openChatPanel(page) {
  const toggle = page.getByTestId('chat-toggle-button');
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') {
    await toggle.click();
  }
}

/**
 * Открывает панель (если закрыта) и переключает её на вкладку «Участники» —
 * `ParticipantList` теперь смонтирован внутри `ChatSidePanel.jsx` (задача 41)
 * и не виден, пока панель закрыта/на другой вкладке.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function openParticipantsTab(page) {
  await openChatPanel(page);
  await page.getByTestId('chat-side-panel-tab-participants').click();
}

/**
 * Отправка сообщения через `ChatPanel` (Design §7.4 `chat:send{text}`, F-24/US-8).
 * Задача 41: `ChatPanel` — содержимое вкладки «Чат» сворачиваемой панели,
 * закрытой по умолчанию — открываем её (панель открывается сразу на вкладке
 * «Чат», `openChatPanel` выше) перед вводом.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} text
 */
export async function sendChatMessage(page, text) {
  await openChatPanel(page);
  await page.getByTestId('chat-input').fill(text);
  await page.getByTestId('chat-send-button').click();
}

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>} тексты всех сообщений/системных событий чата.
 */
export async function chatTexts(page) {
  return page.getByTestId('chat-message-text').allTextContents();
}
