import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import VideoGrid from '../../src/components/VideoGrid.jsx';

beforeEach(() => {
  vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeParticipants(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Участник ${index + 1}`,
    media: { audio: true, video: true },
  }));
}

describe('VideoGrid', () => {
  it('shows invite card for a one-person room', () => {
    const participants = makeParticipants(1);
    const { getByTestId, queryByTestId } = render(
      <VideoGrid participants={participants} selfId="p1" roomUrl="https://example.com/room/r1" />,
    );
    expect(getByTestId('video-grid-invite-card')).toBeTruthy();
    expect(queryByTestId('video-ribbon')).toBeNull();
  });

  it('shows ribbon and free slot when room is not full', () => {
    const participants = makeParticipants(3);
    const { getByTestId } = render(<VideoGrid participants={participants} selfId="p1" />);
    expect(getByTestId('video-ribbon')).toBeTruthy();
    expect(getByTestId('video-grid-free-slot')).toBeTruthy();
  });

  it('puts the first participant other than self on stage', () => {
    const participants = makeParticipants(3);
    const { getByTestId } = render(<VideoGrid participants={participants} selfId="p1" />);
    expect(getByTestId('video-stage').querySelector('[data-participant-id="p2"]')).not.toBeNull();
  });

  it('copies invite link and restores button text after timeout', async () => {
    vi.useFakeTimers();
    try {
      const clipboardWrite = vi.fn().mockResolvedValue(undefined);
      const { getByTestId } = render(
        <VideoGrid
          participants={makeParticipants(1)}
          selfId="p1"
          roomUrl="https://example.com/room/r1"
          deps={{ clipboardWrite }}
        />,
      );

      await act(async () => {
        fireEvent.click(getByTestId('video-grid-invite-copy'));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(clipboardWrite).toHaveBeenCalledWith('https://example.com/room/r1');
      expect(getByTestId('video-grid-invite-copy').textContent).toBe('Скопировано');

      act(() => {
        vi.advanceTimersByTime(2200);
      });

      expect(getByTestId('video-grid-invite-copy').textContent).toBe('Скопировать ссылку');
    } finally {
      vi.useRealTimers();
    }
  });
});
