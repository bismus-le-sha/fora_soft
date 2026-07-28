import { test, expect } from '@playwright/test';
import { createRoom, joinRoomByUrl, sendChatMessage, chatTexts, waitForParticipantCount } from './helpers.js';

/**
 * E2E-smoke — чат, включая позднего участника, видящего историю (задача 32).
 *
 * Requirements: US-8 (обмен сообщениями), US-10 (поздний вход видит историю,
 * F-14/F-23). Design §11.1/§11.4, §7.4.
 *
 * Сценарий: A и B в комнате; A отправляет сообщение — B должен увидеть его
 * без перезагрузки. Затем C входит в уже идущий звонок **позже** (по той же
 * ссылке) — по критерию приёмки задачи 32 и Design §7.4/`join:ok.history`,
 * его `ChatPanel` при монтировании уже должен показывать всю историю чата,
 * а не только новые сообщения, отправленные после его входа.
 */
test.describe('Чат (US-8/US-10)', () => {
  test('сообщение доходит собеседнику; поздний участник видит историю чата', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      const { roomUrl } = await createRoom(pageA, 'Алекс');
      await joinRoomByUrl(pageB, roomUrl, 'Борис');
      await waitForParticipantCount(pageA, 2);
      await waitForParticipantCount(pageB, 2);

      await sendChatMessage(pageA, 'Привет от Алекса');

      await expect(pageB.getByTestId('chat-message-text').last()).toHaveText('Привет от Алекса');
      // Автор тоже видит своё сообщение — broadcast `chat:message` уходит
      // всем в комнате, включая отправителя (Design §7.4).
      await expect(pageA.getByTestId('chat-message-text').last()).toHaveText('Привет от Алекса');

      // Поздний вход (US-10): третий участник присоединяется ПОСЛЕ того, как
      // сообщение уже было отправлено.
      const contextC = await browser.newContext();
      const pageC = await contextC.newPage();
      try {
        await joinRoomByUrl(pageC, roomUrl, 'Вика');
        await waitForParticipantCount(pageA, 3);
        await waitForParticipantCount(pageC, 3);

        const textsOnC = await chatTexts(pageC);
        expect(textsOnC).toContain('Привет от Алекса');
      } finally {
        await contextC.close();
      }
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
