import { test, expect } from '@playwright/test';
import { createRoom, joinRoomByUrl, participantNames, waitForParticipantCount } from './helpers.js';

/**
 * E2E-smoke — вход по ссылке + 2-местный звонок (задача 32).
 *
 * Requirements: US-4 (вход по ссылке), US-5 (2-местный звонок), US-6 (видео
 * нескольких участников). Design §11.1/§11.4, §6.4, §7.1.
 *
 * Сценарий: участник A создаёт комнату (StartScreen → JoinGate → RoomScreen);
 * участник B входит **по прямой ссылке** (`/room/:roomId`, US-4) во втором
 * browser-context (эмуляция второго компьютера/вкладки, fake-media на обоих).
 * Оба должны увидеть друг друга в списке участников и получить по
 * `video-tile` на каждого (VideoGrid, задача 25) — сама передача медиа между
 * fake-устройствами вне скоупа smoke-теста (это WebRTC/ICE между реальными
 * браузерами, не наблюдаемое из data-testid; здесь проверяется само
 * приложение-состояние комнаты, не факт декодирования видео).
 */
test.describe('Вход по ссылке и 2-местный звонок (US-4/US-5/US-6)', () => {
  test('участник, вошедший по ссылке, виден старожилу и наоборот', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      const { roomUrl } = await createRoom(pageA, 'Алекс');

      // US-4: вход по ссылке — participant B никогда не видел StartScreen.
      await joinRoomByUrl(pageB, roomUrl, 'Борис');

      await waitForParticipantCount(pageA, 2);
      await waitForParticipantCount(pageB, 2);

      const namesOnA = await participantNames(pageA);
      const namesOnB = await participantNames(pageB);
      expect(namesOnA.join(' ')).toContain('Алекс');
      expect(namesOnA.join(' ')).toContain('Борис');
      expect(namesOnB.join(' ')).toContain('Алекс');
      expect(namesOnB.join(' ')).toContain('Борис');

      // VideoGrid (задача 25): по плитке на каждого участника снимка.
      await expect(pageA.getByTestId('video-tile')).toHaveCount(2);
      await expect(pageB.getByTestId('video-tile')).toHaveCount(2);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
