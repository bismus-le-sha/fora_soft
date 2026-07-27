import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import ControlBar from '../../src/components/ControlBar.jsx';

/**
 * Задача 27 — `ControlBar` — управление и копирование ссылки (Design §4.2,
 * §7.2, §7.3, F-03, F-09, F-10, F-17, US-3, US-7, US-10).
 *
 * Критерии приёмки (`impl-video-chat-room.md`, задача 27): «RTL-тест —
 * тумблеры отражают состояние; «Копировать ссылку» пишет URL в буфер и
 * показывает подтверждение; «Выйти» эмитит `leave`» (здесь — вызывает
 * колбэковый контракт `onLeave`, реальная эмиссия `signaling.emit('leave')`
 * — ответственность `RoomScreen`, см. его JSDoc).
 *
 * По прецеденту `JoinGate.test.jsx`/`StartScreen.test.jsx` — клики через
 * `fireEvent` (не `@testing-library/user-event`, эта зависимость в проекте
 * не установлена).
 */

function renderControlBar(props = {}, deps = {}) {
  const onToggleAudio = vi.fn();
  const onToggleVideo = vi.fn();
  const onLeave = vi.fn();
  const clipboardWrite = vi.fn().mockResolvedValue(undefined);

  const utils = render(
    <ControlBar
      mediaState={{ audio: true, video: true }}
      onToggleAudio={onToggleAudio}
      onToggleVideo={onToggleVideo}
      onLeave={onLeave}
      roomUrl="https://example.com/room/room-1"
      deps={{ clipboardWrite, ...deps }}
      {...props}
    />,
  );

  return { ...utils, onToggleAudio, onToggleVideo, onLeave, clipboardWrite };
}

describe('ControlBar (Design §4.2/§7.2/§7.3, критерий приёмки задачи 27)', () => {
  it('тумблеры отражают текущее mediaState (audio/video on)', () => {
    const { getByTestId } = renderControlBar({ mediaState: { audio: true, video: true } });

    expect(getByTestId('toggle-audio').getAttribute('aria-pressed')).toBe('true');
    expect(getByTestId('toggle-audio').textContent).toContain('Выключить микрофон');
    expect(getByTestId('toggle-video').getAttribute('aria-pressed')).toBe('true');
    expect(getByTestId('toggle-video').textContent).toContain('Выключить камеру');
  });

  it('тумблеры отражают текущее mediaState (audio/video off)', () => {
    const { getByTestId } = renderControlBar({ mediaState: { audio: false, video: false } });

    expect(getByTestId('toggle-audio').getAttribute('aria-pressed')).toBe('false');
    expect(getByTestId('toggle-audio').textContent).toContain('Включить микрофон');
    expect(getByTestId('toggle-video').getAttribute('aria-pressed')).toBe('false');
    expect(getByTestId('toggle-video').textContent).toContain('Включить камеру');
  });

  it('клик по тумблеру микрофона вызывает onToggleAudio', () => {
    const { getByTestId, onToggleAudio, onToggleVideo } = renderControlBar();

    fireEvent.click(getByTestId('toggle-audio'));

    expect(onToggleAudio).toHaveBeenCalledTimes(1);
    expect(onToggleVideo).not.toHaveBeenCalled();
  });

  it('клик по тумблеру камеры вызывает onToggleVideo', () => {
    const { getByTestId, onToggleVideo, onToggleAudio } = renderControlBar();

    fireEvent.click(getByTestId('toggle-video'));

    expect(onToggleVideo).toHaveBeenCalledTimes(1);
    expect(onToggleAudio).not.toHaveBeenCalled();
  });

  it('«Копировать ссылку» пишет URL комнаты в буфер и показывает подтверждение', async () => {
    const { getByTestId, queryByTestId, clipboardWrite } = renderControlBar({
      roomUrl: 'https://example.com/room/room-42',
    });

    expect(queryByTestId('copy-link-confirmation')).toBeNull();

    fireEvent.click(getByTestId('copy-link-button'));

    await waitFor(() => expect(clipboardWrite).toHaveBeenCalledWith('https://example.com/room/room-42'));
    await waitFor(() => expect(getByTestId('copy-link-confirmation')).toBeTruthy());
  });

  it('отказ записи в буфер не бросает и не показывает подтверждение', async () => {
    const clipboardWrite = vi.fn().mockRejectedValue(new Error('denied'));
    const { getByTestId, queryByTestId } = renderControlBar({}, { clipboardWrite });

    fireEvent.click(getByTestId('copy-link-button'));

    await waitFor(() => expect(clipboardWrite).toHaveBeenCalledTimes(1));
    expect(queryByTestId('copy-link-confirmation')).toBeNull();
  });

  it('клик по «Выйти» вызывает onLeave', () => {
    const { getByTestId, onLeave } = renderControlBar();

    fireEvent.click(getByTestId('leave-button'));

    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});
