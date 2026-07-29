import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';
import RoomTopBar from '../../src/components/RoomTopBar.jsx';

/**
 * Задача 38 — `RoomTopBar` (замена `ControlBar.jsx`, задача 27) — верхняя
 * плашка комнаты (Design addendum §3/§5.2/§5.3, README §4, F-03, F-09, F-10,
 * F-17, US-3, US-7, US-10).
 *
 * Критерии приёмки (`impl-video-chat-room.md`, задача 38): «`formatRoomCode`
 * покрыт юнит-тестом (см. `tests/lib/roomId.test.js`, не искажает/не заменяет
 * реальный `roomId`); таймер тикает (fake timers); тост появляется/скрывается
 * по таймеру; клик «Выйти» больше НЕ эмитит `leave` напрямую (здесь — не
 * вызывает ничего, кроме `onRequestLeave`; реальная эмиссия — забота
 * `RoomScreen`, см. его тесты)».
 *
 * По прецеденту `ControlBar.test.jsx` — клики через `fireEvent`, DI через
 * `deps` (здесь дополнительно `deps.now` для детерминированного таймера).
 */

function renderRoomTopBar(props = {}, deps = {}) {
  const onToggleAudio = vi.fn();
  const onToggleVideo = vi.fn();
  const onRequestLeave = vi.fn();
  const clipboardWrite = vi.fn().mockResolvedValue(undefined);

  const utils = render(
    <RoomTopBar
      roomId="4f2a9c11-70e2-4b3a-9c2d-1a2b3c4d5e6f"
      mediaState={{ audio: true, video: true }}
      onToggleAudio={onToggleAudio}
      onToggleVideo={onToggleVideo}
      onRequestLeave={onRequestLeave}
      roomUrl="https://example.com/room/room-1"
      deps={{ clipboardWrite, ...deps }}
      {...props}
    />,
  );

  return { ...utils, onToggleAudio, onToggleVideo, onRequestLeave, clipboardWrite };
}

describe('RoomTopBar (Design addendum §3/§5.2/§5.3, критерий приёмки задачи 38)', () => {
  describe('код комнаты (addendum §5.2, SEC-14)', () => {
    it('рендерит formatRoomCode(roomId), не сырой roomId', () => {
      const { getByTestId } = renderRoomTopBar({ roomId: '4f2a9c11-70e2-4b3a-9c2d-1a2b3c4d5e6f' });

      expect(getByTestId('room-code').textContent).toBe('RM-4F2A');
    });
  });

  describe('таймер звонка (addendum §5.3, fake timers)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('тикает раз в секунду от joinedAt (MM:SS)', () => {
      const joinedAt = 1_000_000;
      const now = vi.fn(() => joinedAt);
      const { getByTestId } = renderRoomTopBar({ joinedAt }, { now });

      expect(getByTestId('call-timer').textContent).toBe('00:00');

      now.mockReturnValue(joinedAt + 5000);
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(getByTestId('call-timer').textContent).toBe('00:05');

      now.mockReturnValue(joinedAt + 65_000);
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(getByTestId('call-timer').textContent).toBe('01:05');
    });

    it('без joinedAt (вход ещё не подтверждён) показывает 00:00 и не падает', () => {
      const { getByTestId } = renderRoomTopBar({ joinedAt: null });

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(getByTestId('call-timer').textContent).toBe('00:00');
    });
  });

  describe('тумблеры mic/cam', () => {
    it('отражают текущее mediaState (on) через aria-pressed', () => {
      const { getByTestId } = renderRoomTopBar({ mediaState: { audio: true, video: true } });

      expect(getByTestId('toggle-audio').getAttribute('aria-pressed')).toBe('true');
      expect(getByTestId('toggle-video').getAttribute('aria-pressed')).toBe('true');
    });

    it('отражают текущее mediaState (off) через aria-pressed', () => {
      const { getByTestId } = renderRoomTopBar({ mediaState: { audio: false, video: false } });

      expect(getByTestId('toggle-audio').getAttribute('aria-pressed')).toBe('false');
      expect(getByTestId('toggle-video').getAttribute('aria-pressed')).toBe('false');
    });

    it('клик по тумблеру микрофона вызывает onToggleAudio, не onToggleVideo', () => {
      const { getByTestId, onToggleAudio, onToggleVideo } = renderRoomTopBar();

      fireEvent.click(getByTestId('toggle-audio'));

      expect(onToggleAudio).toHaveBeenCalledTimes(1);
      expect(onToggleVideo).not.toHaveBeenCalled();
    });

    it('клик по тумблеру камеры вызывает onToggleVideo, не onToggleAudio', () => {
      const { getByTestId, onToggleVideo, onToggleAudio } = renderRoomTopBar();

      fireEvent.click(getByTestId('toggle-video'));

      expect(onToggleVideo).toHaveBeenCalledTimes(1);
      expect(onToggleAudio).not.toHaveBeenCalled();
    });
  });

  describe('«Скопировать ссылку» + тост (README §4: автоскрытие 2200ms)', () => {
    it('пишет URL комнаты в буфер и показывает тост', async () => {
      const { getByTestId, queryByTestId, clipboardWrite } = renderRoomTopBar({
        roomUrl: 'https://example.com/room/room-42',
      });

      expect(queryByTestId('copy-link-confirmation')).toBeNull();

      fireEvent.click(getByTestId('copy-link-button'));

      await waitFor(() => expect(clipboardWrite).toHaveBeenCalledWith('https://example.com/room/room-42'));
      await waitFor(() => expect(getByTestId('copy-link-confirmation')).toBeTruthy());
    });

    it('тост скрывается сам через 2200ms (fake timers)', async () => {
      vi.useFakeTimers();
      try {
        const { getByTestId, queryByTestId } = renderRoomTopBar();

        await act(async () => {
          fireEvent.click(getByTestId('copy-link-button'));
          // даём резолвнуться промису clipboardWrite до продвижения таймеров
          await Promise.resolve();
          await Promise.resolve();
        });

        expect(getByTestId('copy-link-confirmation')).toBeTruthy();

        act(() => {
          vi.advanceTimersByTime(2199);
        });
        expect(queryByTestId('copy-link-confirmation')).toBeTruthy();

        act(() => {
          vi.advanceTimersByTime(1);
        });
        expect(queryByTestId('copy-link-confirmation')).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('отказ записи в буфер не бросает и не показывает тост', async () => {
      const clipboardWrite = vi.fn().mockRejectedValue(new Error('denied'));
      const { getByTestId, queryByTestId } = renderRoomTopBar({}, { clipboardWrite });

      fireEvent.click(getByTestId('copy-link-button'));

      await waitFor(() => expect(clipboardWrite).toHaveBeenCalledTimes(1));
      expect(queryByTestId('copy-link-confirmation')).toBeNull();
    });
  });

  describe('счётчик участников (N/4)', () => {
    it('рендерит participantCount/4', () => {
      const { getByTestId } = renderRoomTopBar({ participantCount: 3 });
      expect(getByTestId('participant-counter').textContent).toContain('3/4');
    });

    it('по умолчанию (без пропа) — 0/4', () => {
      const { getByTestId } = renderRoomTopBar();
      expect(getByTestId('participant-counter').textContent).toContain('0/4');
    });
  });

  describe('«Чат» + бейдж непрочитанных (без логики — задача 41)', () => {
    it('без unreadCount бейдж не рендерится', () => {
      const { queryByTestId } = renderRoomTopBar();
      expect(queryByTestId('chat-unread-badge')).toBeNull();
    });

    it('unreadCount > 0 рендерит бейдж с числом', () => {
      const { getByTestId } = renderRoomTopBar({ unreadCount: 2 });
      expect(getByTestId('chat-unread-badge').textContent).toBe('2');
    });

    it('клик переключает локальный визуальный tumbler (aria-pressed) и вызывает onToggleChat, если передан', () => {
      const onToggleChat = vi.fn();
      const { getByTestId } = renderRoomTopBar({ onToggleChat });

      const chatButton = getByTestId('chat-toggle-button');
      expect(chatButton.getAttribute('aria-pressed')).toBe('false');

      fireEvent.click(chatButton);

      expect(chatButton.getAttribute('aria-pressed')).toBe('true');
      expect(onToggleChat).toHaveBeenCalledTimes(1);
    });
  });

  describe('«Выйти» — НЕ эмитит leave напрямую (критерий приёмки задачи 38)', () => {
    it('клик вызывает ТОЛЬКО onRequestLeave', () => {
      const { getByTestId, onRequestLeave } = renderRoomTopBar();

      fireEvent.click(getByTestId('leave-button'));

      expect(onRequestLeave).toHaveBeenCalledTimes(1);
    });
  });
});
