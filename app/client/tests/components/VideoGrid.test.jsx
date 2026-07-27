import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import VideoGrid from '../../src/components/VideoGrid.jsx';

/**
 * Задача 25 — `VideoGrid` — адаптивная сетка 1–4 плитки (Design §4.2,
 * F-07, US-6).
 *
 * Критерии приёмки (`impl-video-chat-room.md`, задача 25): «RTL-тест —
 * 1/2/3/4 плитки дают ожидаемую раскладку; self-view присутствует».
 */

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
});
