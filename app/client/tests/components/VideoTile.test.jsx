import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import VideoTile from '../../src/components/VideoTile.jsx';

/**
 * Задача 26 — `VideoTile` — self/remote плитка (Design §4.2, §10.1, §11.3,
 * F-08, F-14, F-16, F-18, US-6, US-12, SEC-04).
 *
 * Критерии приёмки (`impl-video-chat-room.md`, задача 26): «RTL-тест —
 * `video:false` → силуэт+имя; `audio:false` → иконка mic-off; имя рендерится
 * как текст (без innerHTML/dangerouslySetInnerHTML)».
 *
 * jsdom не реализует `HTMLMediaElement.prototype.play()` (бросает
 * «not implemented» в virtualConsole) — задача 31 добавила в `VideoTile`
 * реальный вызов `audioEl.play()` (autoplay-fallback, см. ниже), поэтому
 * файлово-глобальный мок обязателен для ЛЮБОГО теста, где рендерится
 * не-self плитка с `stream` (иначе шумная ошибка в stderr на каждый такой
 * рендер, даже в тестах, не относящихся к autoplay-fallback).
 */

const participant = { id: 'p1', name: 'Алекс' };

let playSpy;

beforeEach(() => {
  playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('VideoTile (Design §4.2/§11.3, критерий приёмки задачи 26)', () => {
  it('mediaState.video === false — рендерит заглушку-силуэт и имя, без видео', () => {
    const { getByTestId, queryByTestId } = render(
      <VideoTile participant={participant} mediaState={{ audio: true, video: false }} />,
    );

    expect(getByTestId('video-tile-placeholder')).toBeTruthy();
    expect(queryByTestId('video-tile-video')).toBeNull();
    expect(getByTestId('video-tile-name').textContent).toContain('Алекс');
  });

  it('нет потока (stream отсутствует) — заглушка-силуэт, даже если video !== false', () => {
    const { getByTestId, queryByTestId } = render(
      <VideoTile participant={participant} stream={null} mediaState={{ audio: true, video: true }} />,
    );

    expect(getByTestId('video-tile-placeholder')).toBeTruthy();
    expect(queryByTestId('video-tile-video')).toBeNull();
  });

  it('есть поток и video !== false — рендерит <video>, заглушки нет', () => {
    const fakeStream = {};
    const { getByTestId, queryByTestId } = render(
      <VideoTile participant={participant} stream={fakeStream} mediaState={{ audio: true, video: true }} />,
    );

    expect(getByTestId('video-tile-video')).toBeTruthy();
    expect(queryByTestId('video-tile-placeholder')).toBeNull();
  });

  it('mediaState.audio === false — отображает иконку mic-off', () => {
    const { getByTestId } = render(
      <VideoTile participant={participant} mediaState={{ audio: false, video: false }} />,
    );

    expect(getByTestId('video-tile-mic-off').textContent).toBe('🔇');
  });

  it('mediaState.audio !== false — иконки mic-off нет', () => {
    const { queryByTestId } = render(
      <VideoTile participant={participant} mediaState={{ audio: true, video: false }} />,
    );

    expect(queryByTestId('video-tile-mic-off')).toBeNull();
  });

  it('isSelf добавляет пометку "(я)" и data-self="true"', () => {
    const { getByTestId } = render(
      <VideoTile participant={participant} mediaState={{ audio: true, video: false }} isSelf />,
    );

    const tile = getByTestId('video-tile');
    expect(tile.getAttribute('data-self')).toBe('true');
    expect(getByTestId('video-tile-name').textContent).toContain('(я)');
  });

  it('без isSelf — data-self="false" и без пометки "(я)"', () => {
    const { getByTestId } = render(
      <VideoTile participant={participant} mediaState={{ audio: true, video: false }} />,
    );

    const tile = getByTestId('video-tile');
    expect(tile.getAttribute('data-self')).toBe('false');
    expect(getByTestId('video-tile-name').textContent).not.toContain('(я)');
  });

  it('SEC-04: имя рендерится текстовым узлом — XSS-payload в имени не исполняется и не превращается в разметку', () => {
    const maliciousParticipant = { id: 'p2', name: '<img src=x onerror=alert(1)><script>alert(2)</script>' };
    const { getByTestId, container } = render(
      <VideoTile participant={maliciousParticipant} mediaState={{ audio: true, video: false }} />,
    );

    // Имя видно как обычный текст…
    expect(getByTestId('video-tile-name').textContent).toBe(
      '<img src=x onerror=alert(1)><script>alert(2)</script>',
    );
    // …и НЕ превратилось в реальные DOM-узлы `<img>`/`<script>` (что случилось бы
    // при `dangerouslySetInnerHTML`/`innerHTML`).
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });

  describe('autoplay-fallback (задача 31, Design §8 «Autoplay заблокирован», F-37, US-13)', () => {
    it('remote-плитка с потоком рендерит скрытый <audio autoPlay>, привязанный к stream', () => {
      const fakeStream = {};
      const { getByTestId } = render(
        <VideoTile participant={participant} stream={fakeStream} mediaState={{ audio: true, video: true }} />,
      );

      const audioEl = getByTestId('video-tile-audio');
      expect(audioEl).toBeTruthy();
      expect(audioEl.srcObject).toBe(fakeStream);
    });

    it('self-плитка НЕ рендерит <audio>, даже если stream передан (не слушаем себя)', () => {
      const fakeStream = {};
      const { queryByTestId } = render(
        <VideoTile participant={participant} stream={fakeStream} mediaState={{ audio: true, video: true }} isSelf />,
      );

      expect(queryByTestId('video-tile-audio')).toBeNull();
    });

    it('без потока — <audio> не рендерится (нечего играть)', () => {
      const { queryByTestId } = render(
        <VideoTile participant={participant} stream={null} mediaState={{ audio: true, video: true }} />,
      );

      expect(queryByTestId('video-tile-audio')).toBeNull();
    });

    it('play() успешен — кнопка «Включить звук» не показывается', async () => {
      const { queryByTestId } = render(
        <VideoTile participant={participant} stream={{}} mediaState={{ audio: true, video: true }} />,
      );

      await waitFor(() => expect(playSpy).toHaveBeenCalled());
      expect(queryByTestId('video-tile-unmute')).toBeNull();
    });

    it('play() reject (autoplay заблокирован браузером) — показывается кнопка «Включить звук»', async () => {
      playSpy.mockRejectedValue(
        Object.assign(new Error('play() failed because the user didn’t interact'), { name: 'NotAllowedError' }),
      );
      const { getByTestId } = render(
        <VideoTile participant={participant} stream={{}} mediaState={{ audio: true, video: true }} />,
      );

      const button = await waitFor(() => getByTestId('video-tile-unmute'));
      expect(button.textContent).toBe('Включить звук');
    });

    it('клик по «Включить звук» повторно вызывает play(); успех прячет кнопку', async () => {
      playSpy.mockRejectedValueOnce(new Error('NotAllowedError')).mockResolvedValueOnce(undefined);
      const { getByTestId, queryByTestId } = render(
        <VideoTile participant={participant} stream={{}} mediaState={{ audio: true, video: true }} />,
      );
      const button = await waitFor(() => getByTestId('video-tile-unmute'));

      fireEvent.click(button);

      await waitFor(() => expect(playSpy).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(queryByTestId('video-tile-unmute')).toBeNull());
    });

    it('remote <video> всегда muted (звук идёт через отдельный <audio>, без задвоения)', () => {
      const { getByTestId } = render(
        <VideoTile participant={participant} stream={{}} mediaState={{ audio: true, video: true }} />,
      );

      expect(getByTestId('video-tile-video').muted).toBe(true);
    });
  });
});
