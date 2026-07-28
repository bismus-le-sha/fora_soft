import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import VideoGrid from '../../src/components/VideoGrid.jsx';

/**
 * Задача 25 — `VideoGrid` — адаптивная сетка 1–4 плитки (Design §4.2,
 * F-07, US-6).
 *
 * Критерии приёмки (`impl-video-chat-room.md`, задача 25): «RTL-тест —
 * 1/2/3/4 плитки дают ожидаемую раскладку; self-view присутствует».
 *
 * jsdom не реализует `HTMLMediaElement.prototype.play()` — задача 31
 * добавила в `VideoTile` реальный вызов `audioEl.play()` для не-self плиток
 * со `stream` (autoplay-fallback, см. `VideoTile.test.jsx`); мок нужен
 * файлово-глобально, иначе шумная «not implemented» ошибка в stderr при
 * рендере таких плиток здесь (тест не про autoplay, поэтому достаточно
 * дефолтного resolved-мока, без проверки самого вызова).
 */

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

describe('VideoGrid (Design §4.2, критерий приёмки задачи 25)', () => {
  it.each([1, 2, 3, 4])('%i участник(ов) — рендерит столько же плиток и класс grid-count-%i', (count) => {
    const participants = makeParticipants(count);
    const { getAllByTestId, container } = render(<VideoGrid participants={participants} selfId="p1" />);

    expect(getAllByTestId('video-tile')).toHaveLength(count);
    const grid = container.querySelector('.video-grid');
    expect(grid).not.toBeNull();
    expect(grid.className).toContain(`grid-count-${count}`);
    expect(grid.getAttribute('data-count')).toBe(String(count));
  });

  it('self-view присутствует и помечен data-self="true", остальные — "false"', () => {
    const participants = makeParticipants(3);
    const { getAllByTestId } = render(<VideoGrid participants={participants} selfId="p2" />);

    const tiles = getAllByTestId('video-tile');
    const self = tiles.find((tile) => tile.getAttribute('data-participant-id') === 'p2');
    const others = tiles.filter((tile) => tile.getAttribute('data-participant-id') !== 'p2');

    expect(self.getAttribute('data-self')).toBe('true');
    expect(self.textContent).toContain('(я)');
    for (const other of others) {
      expect(other.getAttribute('data-self')).toBe('false');
      expect(other.textContent).not.toContain('(я)');
    }
  });

  it('участник с media.audio === false отображает иконку mic-off', () => {
    const participants = [
      { id: 'p1', name: 'Алекс', media: { audio: false, video: true } },
      { id: 'p2', name: 'Боб', media: { audio: true, video: true } },
    ];
    const { getAllByTestId } = render(<VideoGrid participants={participants} selfId="p2" />);

    const tiles = getAllByTestId('video-tile');
    const muted = tiles.find((tile) => tile.getAttribute('data-participant-id') === 'p1');
    const unmuted = tiles.find((tile) => tile.getAttribute('data-participant-id') === 'p2');

    expect(muted.textContent).toContain('🔇');
    expect(unmuted.textContent).not.toContain('🔇');
  });

  it('пустой список участников — сетка рендерится без плиток', () => {
    const { getAllByTestId, container } = render(<VideoGrid participants={[]} selfId={null} />);

    expect(() => getAllByTestId('video-tile')).toThrow();
    const grid = container.querySelector('.video-grid');
    expect(grid.getAttribute('data-count')).toBe('0');
  });

  describe('localStream/remoteStreams — проводка в VideoTile (задача 31, F-07/F-37)', () => {
    it('self-плитка получает localStream, остальные — свой поток из remoteStreams по id', () => {
      const participants = makeParticipants(3);
      const localStream = { id: 'local' };
      const remoteStreams = { p2: { id: 'remote-2' }, p3: { id: 'remote-3' } };
      const { getAllByTestId } = render(
        <VideoGrid
          participants={participants}
          selfId="p1"
          localStream={localStream}
          remoteStreams={remoteStreams}
        />,
      );

      // localStream/remoteStream переданы — video рендерится (hasVideo=true), заглушки нет.
      const tiles = getAllByTestId('video-tile');
      expect(tiles).toHaveLength(3);
      for (const tile of tiles) {
        expect(tile.querySelector('[data-testid="video-tile-video"]')).not.toBeNull();
        expect(tile.querySelector('[data-testid="video-tile-placeholder"]')).toBeNull();
      }
    });

    it('без localStream/remoteStreams (не переданы) — поведение как раньше, заглушка-силуэт', () => {
      const participants = makeParticipants(2);
      const { getAllByTestId } = render(<VideoGrid participants={participants} selfId="p1" />);

      for (const tile of getAllByTestId('video-tile')) {
        expect(tile.querySelector('[data-testid="video-tile-placeholder"]')).not.toBeNull();
      }
    });

    it('участник без записи в remoteStreams получает null (заглушка), не бросает', () => {
      const participants = makeParticipants(2);
      const { getAllByTestId } = render(
        <VideoGrid participants={participants} selfId="p1" remoteStreams={{}} />,
      );

      const remoteTile = getAllByTestId('video-tile').find(
        (tile) => tile.getAttribute('data-participant-id') === 'p2',
      );
      expect(remoteTile.querySelector('[data-testid="video-tile-placeholder"]')).not.toBeNull();
    });
  });
});
