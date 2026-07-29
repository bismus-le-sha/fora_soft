import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import VideoTile from '../../src/components/VideoTile.jsx';

const participant = { id: 'p1', name: 'Алекс' };

let playSpy;

beforeEach(() => {
  playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('VideoTile', () => {
  it('renders placeholder and name when video is off', () => {
    const { getByTestId, queryByTestId } = render(
      <VideoTile participant={participant} mediaState={{ audio: true, video: false }} />,
    );
    expect(getByTestId('video-tile-placeholder')).toBeTruthy();
    expect(queryByTestId('video-tile-video')).toBeNull();
    expect(getByTestId('video-tile-name').textContent).toContain('Алекс');
  });

  it('renders video when a stream exists and video is enabled', () => {
    const { getByTestId } = render(
      <VideoTile participant={participant} stream={{}} mediaState={{ audio: true, video: true }} />,
    );
    expect(getByTestId('video-tile-video')).toBeTruthy();
  });

  it('shows mic-off badge when audio is disabled', () => {
    const { getByTestId } = render(
      <VideoTile participant={participant} mediaState={{ audio: false, video: false }} />,
    );
    expect(getByTestId('video-tile-mic-off').textContent).toBe('🔇');
  });

  it('shows mic-on badge when audio is enabled', () => {
    const { getByTestId } = render(
      <VideoTile participant={participant} mediaState={{ audio: true, video: false }} />,
    );
    expect(getByTestId('video-tile-mic-on').textContent).toBe('🎤');
  });

  it('marks self tile with "(я)"', () => {
    const { getByTestId } = render(
      <VideoTile participant={participant} mediaState={{ audio: true, video: false }} isSelf />,
    );
    expect(getByTestId('video-tile-name').textContent).toContain('(я)');
  });

  it('does not infer speaking state from being on stage', () => {
    const stage = render(
      <VideoTile participant={participant} stream={{}} mediaState={{ audio: true, video: true }} variant="stage" />,
    );
    expect(stage.queryByTestId('video-tile-speaking')).toBeNull();
    expect(stage.queryByText('ГОВОРИТ')).toBeNull();
  });

  it('treats an unknown audio state as muted until the server confirms it is on', () => {
    const { getByTestId, queryByTestId } = render(
      <VideoTile participant={participant} mediaState={{ video: false }} />,
    );
    expect(getByTestId('video-tile-mic-off').textContent).toBe('🔇');
    expect(queryByTestId('video-tile-mic-on')).toBeNull();
  });

  it('renders autoplay fallback button when play() is blocked', async () => {
    playSpy.mockRejectedValueOnce(new Error('NotAllowedError'));
    const { getByTestId } = render(
      <VideoTile participant={participant} stream={{}} mediaState={{ audio: true, video: true }} />,
    );
    await waitFor(() => expect(getByTestId('video-tile-unmute')).toBeTruthy());
  });

  it('retrying the autoplay button replays audio and hides the fallback', async () => {
    playSpy.mockRejectedValueOnce(new Error('NotAllowedError')).mockResolvedValueOnce(undefined);
    const { getByTestId, queryByTestId } = render(
      <VideoTile participant={participant} stream={{}} mediaState={{ audio: true, video: true }} />,
    );
    const button = await waitFor(() => getByTestId('video-tile-unmute'));
    fireEvent.click(button);
    await waitFor(() => expect(queryByTestId('video-tile-unmute')).toBeNull());
  });
});
