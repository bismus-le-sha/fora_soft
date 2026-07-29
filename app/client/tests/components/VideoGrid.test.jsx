import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import VideoGrid from '../../src/components/VideoGrid.jsx';

/**
 * Задача 39 — «Сцена + Лента» (реструктуризация `VideoGrid`, задача 25),
 * Design addendum §3 (`VideoGrid.jsx`, RESTRUCTURE), §5.1.
 *
 * Критерии приёмки (`impl-video-chat-room.md`, задача 39): «тест эвристики —
 * join/leave меняют `activeSpeakerId` предсказуемо (первый чужой, иначе
 * self); 1 участник → карточка приглашения; 2–3 → свободный слот; 4 → без
 * слота; существующие тесты `VideoGrid`/`RoomScreen` актуализированы под
 * новую структуру в этом же PR».
 *
 * `computeActiveSpeakerId` сама покрыта юнит-тестами изолированно
 * (`tests/lib/activeSpeaker.test.js`) — здесь проверяется её эффект на
 * рендер (кто оказался на Сцене/в Ленте), не повторяя всю матрицу эвристики.
 *
 * jsdom не реализует `HTMLMediaElement.prototype.play()` — задача 31
 * добавила в `VideoTile` реальный вызов `audioEl.play()` для не-self плиток
 * со `stream` (autoplay-fallback); мок нужен файлово-глобально, иначе шумная
 * «not implemented» ошибка в stderr при рендере таких плиток здесь.
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

describe('VideoGrid (Design addendum §3/§5.1, критерий приёмки задачи 39)', () => {
  describe('activeSpeakerId-эвристика (первый чужой, иначе self)', () => {
    it('self первый в списке — на Сцену попадает первый чужой участник', () => {
      const participants = makeParticipants(3); // p1, p2, p3
      const { getByTestId } = render(<VideoGrid participants={participants} selfId="p1" />);

      const stage = getByTestId('video-stage');
      expect(stage.querySelector('[data-participant-id="p2"]')).not.toBeNull();
      expect(stage.querySelector('[data-self="true"]')).toBeNull();
    });

    it('только self в комнате — self попадает на Сцену', () => {
      const participants = makeParticipants(1); // p1 = self
      const { getByTestId } = render(<VideoGrid participants={participants} selfId="p1" />);

      const stage = getByTestId('video-stage');
      expect(stage.querySelector('[data-self="true"]')).not.toBeNull();
    });

    it('join нового участника не переключает уже выбранного (первый чужой остаётся первым)', () => {
      const participants = makeParticipants(2); // p1=self, p2
      const { getByTestId, rerender } = render(<VideoGrid participants={participants} selfId="p1" />);
      expect(getByTestId('video-stage').querySelector('[data-participant-id="p2"]')).not.toBeNull();

      const withNewJoin = [...participants, { id: 'p3', name: 'Участник 3', media: {} }];
      rerender(<VideoGrid participants={withNewJoin} selfId="p1" />);

      expect(getByTestId('video-stage').querySelector('[data-participant-id="p2"]')).not.toBeNull();
      expect(getByTestId('video-ribbon').querySelector('[data-participant-id="p3"]')).not.toBeNull();
    });

    it('leave активного участника переключает Сцену на следующего чужого', () => {
      const participants = makeParticipants(3); // p1=self, p2, p3
      const { getByTestId, rerender } = render(<VideoGrid participants={participants} selfId="p1" />);
      expect(getByTestId('video-stage').querySelector('[data-participant-id="p2"]')).not.toBeNull();

      const afterLeave = participants.filter((p) => p.id !== 'p2');
      rerender(<VideoGrid participants={afterLeave} selfId="p1" />);

      expect(getByTestId('video-stage').querySelector('[data-participant-id="p3"]')).not.toBeNull();
    });

    it('leave последнего чужого возвращает Сцену на self', () => {
      const participants = makeParticipants(2); // p1=self, p2
      const { getByTestId, rerender } = render(<VideoGrid participants={participants} selfId="p1" />);

      rerender(<VideoGrid participants={[participants[0]]} selfId="p1" />);

      expect(getByTestId('video-stage').querySelector('[data-self="true"]')).not.toBeNull();
    });
  });

  describe('Лента/свободный слот/карточка приглашения (README §4)', () => {
    it('1 участник (только self) — карточка приглашения вместо Ленты, без свободного слота', () => {
      const participants = makeParticipants(1);
      const { queryByTestId, getByTestId } = render(
        <VideoGrid participants={participants} selfId="p1" roomUrl="https://example.com/room/r1" />,
      );

      expect(getByTestId('video-grid-invite-card')).toBeTruthy();
      expect(queryByTestId('video-ribbon')).toBeNull();
      expect(queryByTestId('video-grid-free-slot')).toBeNull();
    });

    it.each([2, 3])('%i участника — Лента со свободным слотом', (count) => {
      const participants = makeParticipants(count);
      const { getByTestId, queryByTestId } = render(<VideoGrid participants={participants} selfId="p1" />);

      expect(getByTestId('video-ribbon')).toBeTruthy();
      expect(getByTestId('video-grid-free-slot')).toBeTruthy();
      expect(queryByTestId('video-grid-invite-card')).toBeNull();
    });

    it('4 участника — Лента без свободного слота (комната заполнена)', () => {
      const participants = makeParticipants(4);
      const { getByTestId, queryByTestId } = render(<VideoGrid participants={participants} selfId="p1" />);

      expect(getByTestId('video-ribbon')).toBeTruthy();
      expect(queryByTestId('video-grid-free-slot')).toBeNull();
      expect(queryByTestId('video-grid-invite-card')).toBeNull();
    });

    it('пустой список участников — рендерится без плиток, без Ленты/карточки, не падает', () => {
      const { queryByTestId, getByTestId, queryAllByTestId } = render(
        <VideoGrid participants={[]} selfId={null} />,
      );

      expect(queryAllByTestId('video-tile')).toHaveLength(0);
      expect(getByTestId('video-grid').getAttribute('data-count')).toBe('0');
      expect(queryByTestId('video-ribbon')).toBeNull();
      expect(queryByTestId('video-grid-invite-card')).toBeNull();
    });
  });

  describe('карточка приглашения — «Скопировать ссылку» (README §4)', () => {
    it('пишет roomUrl в буфер и показывает «Скопировано», затем возвращает исходную подпись через 2200ms', async () => {
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

  it('self-плитка помечена data-self="true" независимо от того, на Сцене она или в Ленте', () => {
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

  it('участник с media.audio === false отображает иконку mic-off (Сцена или Лента)', () => {
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
      const participants = makeParticipants(3);
      const { getAllByTestId } = render(
        <VideoGrid participants={participants} selfId="p1" remoteStreams={{}} />,
      );

      // p2 — на Сцене (первый чужой), p3 — в Ленте; оба без записи в remoteStreams.
      const remoteTile = getAllByTestId('video-tile').find(
        (tile) => tile.getAttribute('data-participant-id') === 'p3',
      );
      expect(remoteTile.querySelector('[data-testid="video-tile-placeholder"]')).not.toBeNull();
    });
  });

  describe('Лента — ширина сжимается при isChatOpen (проводка задачи 41, README §4)', () => {
    it('isChatOpen=true добавляет класс сужения Ленты', () => {
      const participants = makeParticipants(2);
      const { getByTestId } = render(
        <VideoGrid participants={participants} selfId="p1" isChatOpen />,
      );

      // CSS Modules хэширует имена классов — проверяем факт наличия ДОПОЛНИТЕЛЬНОГО
      // класса (два токена в className), а не конкретное имя (тот же приём, что
      // проверка `aria-pressed`/структуры в RoomTopBar.test.jsx, не тестируем CSS-значения).
      const ribbon = getByTestId('video-ribbon');
      expect(ribbon.className.trim().split(/\s+/)).toHaveLength(2);
    });

    it('isChatOpen=false (default) — без дополнительного класса', () => {
      const participants = makeParticipants(2);
      const { getByTestId } = render(<VideoGrid participants={participants} selfId="p1" />);

      const ribbon = getByTestId('video-ribbon');
      expect(ribbon.className.trim().split(/\s+/)).toHaveLength(1);
    });
  });

  describe('вариант плитки и noAccess — проводка в VideoTile (задача 40, README §4/§6)', () => {
    it('Сцена рендерит VideoTile с variant="stage" (mono-подпись причины видна без stream)', () => {
      const participants = makeParticipants(1); // только self — на Сцене
      const { getByTestId } = render(<VideoGrid participants={participants} selfId="p1" />);

      const stage = getByTestId('video-stage');
      expect(stage.querySelector('[data-testid="video-tile-placeholder-caption"]')).not.toBeNull();
    });

    it('Лента рендерит VideoTile с variant="ribbon" (mono-подпись причины отсутствует)', () => {
      const participants = makeParticipants(2); // p1=self (Сцена), p2 (Лента)
      const { getByTestId } = render(<VideoGrid participants={participants} selfId="p1" />);

      const ribbon = getByTestId('video-ribbon');
      expect(ribbon.querySelector('[data-testid="video-tile-placeholder-caption"]')).toBeNull();
    });

    it('selfDeviceDenied=true — noAccess попадает ТОЛЬКО в self-плитку, не в чужие', () => {
      // p1=self, p2 чужой — эвристика (§5.1) ставит на Сцену первого ЧУЖОГО
      // (p2), self (p1) остаётся в Ленте (см. describe «activeSpeakerId-эвристика» выше).
      const participants = makeParticipants(2);
      const { getByTestId } = render(
        <VideoGrid participants={participants} selfId="p1" selfDeviceDenied />,
      );

      // Сцена — p2 (чужой, media.video===true, нет stream) — "connecting", не "no-access".
      const stagePlaceholder = getByTestId('video-stage').querySelector(
        '[data-testid="video-tile-placeholder"]',
      );
      expect(stagePlaceholder.getAttribute('data-reason')).not.toBe('no-access');

      // Лента — p1 (self) — noAccess форвардится, реальная причина "no-access".
      const selfPlaceholder = getByTestId('video-ribbon').querySelector(
        '[data-testid="video-tile-placeholder"]',
      );
      expect(selfPlaceholder.getAttribute('data-reason')).toBe('no-access');
    });
  });
});
