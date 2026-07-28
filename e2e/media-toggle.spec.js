import { test, expect } from '@playwright/test';
import { createRoom, joinRoomByUrl, waitForParticipantCount } from './helpers.js';

/**
 * E2E-smoke — toggle камеры/микрофона отражается у собеседника (задача 32).
 *
 * Requirements: US-7 (управление своим медиа), F-09/F-10/F-16/F-18/F-19.
 * Design §11.1/§11.4, §7.2 (`media:state` broadcast).
 *
 * Сервер рассылает `media:state{id, audio, video}` ОСТАЛЬНЫМ участникам
 * комнаты (не отправителю, `socket.to(roomId)` — `RoomService.setMedia`);
 * `ParticipantList`/`VideoTile` у собеседника обновляются по этому событию
 * независимо от фактического WebRTC-трека (см. `VideoGrid.jsx`/`VideoTile.jsx`:
 * `hasVideo = Boolean(stream) && mediaState.video !== false` — плитка уходит
 * в заглушку сразу по `media:state`, не дожидаясь renegotiation).
 */
test.describe('Toggle камеры/микрофона (US-7)', () => {
  test('выключение микрофона/камеры у A отражается в списке/плитке у B', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      const { roomUrl } = await createRoom(pageA, 'Алекс');
      await joinRoomByUrl(pageB, roomUrl, 'Борис');
      await waitForParticipantCount(pageA, 2);
      await waitForParticipantCount(pageB, 2);

      const aleksItemOnB = pageB.getByTestId('participant-list-item').filter({ hasText: 'Алекс' });
      const aleksTileOnB = pageB.getByTestId('video-tile').filter({ hasText: 'Алекс' });

      // До тумблера — ни иконки mic-off, ни заглушки-силуэта у Алекса на экране Бориса.
      await expect(aleksItemOnB.getByTestId('participant-list-mic-off')).toHaveCount(0);
      await expect(aleksTileOnB.getByTestId('video-tile-placeholder')).toHaveCount(0);

      const toggleAudio = pageA.getByTestId('toggle-audio');
      await expect(toggleAudio).toHaveAttribute('aria-pressed', 'true');
      await toggleAudio.click();
      await expect(toggleAudio).toHaveAttribute('aria-pressed', 'false');

      await expect(aleksItemOnB.getByTestId('participant-list-mic-off')).toBeVisible();
      await expect(aleksTileOnB.getByTestId('video-tile-mic-off')).toBeVisible();

      const toggleVideo = pageA.getByTestId('toggle-video');
      await expect(toggleVideo).toHaveAttribute('aria-pressed', 'true');
      await toggleVideo.click();
      await expect(toggleVideo).toHaveAttribute('aria-pressed', 'false');

      await expect(aleksTileOnB.getByTestId('video-tile-placeholder')).toBeVisible();
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
