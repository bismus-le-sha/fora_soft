import { test, expect } from '@playwright/test';
import { createRoom, joinRoomByUrl, waitForParticipantCount, chatTexts } from './helpers.js';

/**
 * E2E-smoke — выход/обрыв участника: соседи узнают об уходе (задача 32).
 *
 * Requirements: US-10 (выход из комнаты), F-15 (`chat:system`-уведомление),
 * SEC-11 (очистка комнаты при выходе последнего — покрыто интеграционными
 * тестами сервера отдельно, здесь — сквозной UX-эффект). Design §11.1/§11.4,
 * §7.3 «leave/disconnect».
 *
 * Задача 38: «Выйти» в шапке больше не эмитит `leave` напрямую — открывает
 * гейт подтверждения (`RoomScreen`, временный неоформленный блок до задачи 42
 * `ExitConfirmModal.jsx`); реальный `leave` уходит только по клику
 * `exit-confirm-leave` внутри гейта.
 */
test.describe('Выход/обрыв участника (US-10)', () => {
  test('клик «Выйти» убирает участника у соседа + системное сообщение в чате', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      const { roomUrl } = await createRoom(pageA, 'Алекс');
      await joinRoomByUrl(pageB, roomUrl, 'Борис');
      await waitForParticipantCount(pageA, 2);
      await waitForParticipantCount(pageB, 2);

      await pageB.getByTestId('leave-button').click();
      await pageB.getByTestId('exit-confirm-leave').click();

      // Баг-фикс задачи 42: ушедший сам должен вернуться на стартовый экран
      // (README §7 «После выхода — возврат на стартовый экран ввода имени»),
      // а не остаться визуально в комнате.
      await expect(pageB.getByRole('button', { name: 'Создать комнату' })).toBeVisible();
      expect(new URL(pageB.url()).pathname).toBe('/');

      await waitForParticipantCount(pageA, 1);
      const namesOnA = await pageA.getByTestId('participant-list-name').allTextContents();
      expect(namesOnA.join(' ')).not.toContain('Борис');

      const texts = await chatTexts(pageA);
      expect(texts.some((text) => text.includes('Борис') && text.includes('покинул'))).toBe(true);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test('обрыв соединения (закрытие вкладки) убирает участника у соседа', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextC = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageC = await contextC.newPage();

    try {
      const { roomUrl } = await createRoom(pageA, 'Алекс');
      await joinRoomByUrl(pageC, roomUrl, 'Вика');
      await waitForParticipantCount(pageA, 2);

      // Обрыв, не «чистый» leave — закрываем контекст целиком (транспортный
      // disconnect, Design §7.3), сервер узнаёт об этом через `socket.on('disconnect')`.
      await contextC.close();

      await waitForParticipantCount(pageA, 1);
      const namesOnA = await pageA.getByTestId('participant-list-name').allTextContents();
      expect(namesOnA.join(' ')).not.toContain('Вика');
    } finally {
      await contextA.close();
    }
  });
});
