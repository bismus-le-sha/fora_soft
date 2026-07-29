import { test, expect } from '@playwright/test';
import { createRoom, joinRoomByUrl, waitForParticipantCount } from './helpers.js';

/**
 * E2E-smoke — room-full: (ROOM_CAPACITY+1)-й участник получает отказ (задача 32).
 *
 * Requirements: F-05 (жёсткий лимит участников), US-5, SEC-07 (атомарный
 * лимит — задача 9, критично, покрыт интеграционными тестами сервера
 * отдельно; здесь — сквозной UX-эффект глазами браузера). Design §11.1/§11.4,
 * §8 «Комната заполнена».
 *
 * `ROOM_CAPACITY` дублирует `app/server/src/config.js` (единый источник
 * лимитов, задача 2) численно (кросс-workspace ESM-импорт сюда не заведён —
 * `e2e/` намеренно не является npm-workspace и не резолвит `import.meta.url`
 * серверного модуля вне его собственного `package.json` с `"type": "module"`).
 * При изменении `ROOM_CAPACITY` в `config.js` эту константу нужно поправить
 * синхронно — несовпадение сразу проявится красным этим же тестом.
 */
const ROOM_CAPACITY = 4;
test.describe(`room-full (лимит ${ROOM_CAPACITY} участников, US-5)`, () => {
  test(`${ROOM_CAPACITY + 1}-й участник получает join:rejected{room-full} и баннер с кнопкой «Попробовать снова»`, async ({
    browser,
  }) => {
    test.setTimeout(60_000);

    const contexts = await Promise.all(Array.from({ length: ROOM_CAPACITY + 1 }, () => browser.newContext()));

    try {
      const [firstContext, ...restContexts] = contexts;
      const firstPage = await firstContext.newPage();
      const { roomUrl } = await createRoom(firstPage, 'Участник-1');

      // Заполняем комнату до ROOM_CAPACITY.
      const restPages = [];
      for (let i = 0; i < ROOM_CAPACITY - 1; i += 1) {
        // eslint-disable-next-line no-await-in-loop -- вход по одному, каждый ждёт своего рендера RoomScreen.
        const page = await restContexts[i].newPage();
        // eslint-disable-next-line no-await-in-loop
        await joinRoomByUrl(page, roomUrl, `Участник-${i + 2}`);
        restPages.push(page);
      }

      await waitForParticipantCount(firstPage, ROOM_CAPACITY);

      // (ROOM_CAPACITY+1)-й — комната уже полна.
      const overflowContext = restContexts[ROOM_CAPACITY - 1];
      const overflowPage = await overflowContext.newPage();
      await overflowPage.goto(roomUrl);
      await overflowPage.locator('#join-gate-name').fill('Лишний');
      await overflowPage.getByRole('button', { name: 'Войти' }).click();

      const banner = overflowPage.getByTestId('room-full-banner');
      await expect(banner).toBeVisible();
      await expect(banner.getByRole('button', { name: 'Попробовать снова' })).toBeVisible();

      // Состав комнаты не выросло — лишний участник не попал в список ни у кого.
      await waitForParticipantCount(firstPage, ROOM_CAPACITY);
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });
});
