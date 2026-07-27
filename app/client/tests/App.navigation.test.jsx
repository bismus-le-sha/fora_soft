import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import App from '../src/App.jsx';

/**
 * Задача 19.2 (fix по замечанию code-review) — навигация Start → Room.
 *
 * Критерий приёмки задачи 19 (`impl-video-chat-room.md`): «переход на
 * `/room/:id»`. Design §6.4: «Создание комнаты на StartScreen генерирует
 * `roomId = crypto.randomUUID()` и делает `navigate(/room/:roomId)`».
 *
 * Проверяет именно связку App → StartScreen.onCreate → generateRoomId →
 * history меняется на `/room/:id` (без полной перезагрузки страницы —
 * `pushState`, а не `location.assign`). Генерация id и UX-валидация имени
 * покрыты отдельно в `roomId.test.js`/`StartScreen.test.jsx` — здесь не
 * дублируется, а проверяется сама навигация.
 */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('App: навигация Start ↔ Room (задача 19, Design §6.4)', () => {
  beforeEach(() => {
    globalThis.RTCPeerConnection = function () {};
    globalThis.navigator.mediaDevices = { getUserMedia: () => {} };
    globalThis.isSecureContext = true;
    globalThis.history.pushState(null, '', '/');
  });

  afterEach(() => {
    delete globalThis.RTCPeerConnection;
    delete globalThis.isSecureContext;
    if (globalThis.navigator) {
      delete globalThis.navigator.mediaDevices;
    }
    globalThis.history.pushState(null, '', '/');
  });

  it('на "/" рендерит StartScreen', () => {
    const { getByRole } = render(<App />);
    expect(getByRole('button', { name: /создать комнату/i })).not.toBeNull();
  });

  it('клик «Создать комнату» с валидным именем переводит на /room/:id (без reload) и рендерит соответствующий экран', () => {
    const { container, getByRole } = render(<App />);

    fireEvent.change(container.querySelector('input'), {
      target: { value: 'Алекс' },
    });
    fireEvent.click(getByRole('button', { name: /создать комнату/i }));

    const match = /^\/room\/([0-9a-f-]+)$/.exec(globalThis.location.pathname);
    expect(match).not.toBeNull();
    expect(match[1]).toMatch(UUID_V4);
    expect(container.textContent).toContain(match[1]);
  });

  it('пустое имя: клик не переходит с "/"', () => {
    const { getByRole } = render(<App />);

    fireEvent.click(getByRole('button', { name: /создать комнату/i }));

    expect(globalThis.location.pathname).toBe('/');
  });

  it('прямой заход на /room/:id рендерит экран комнаты с этим id (без StartScreen)', () => {
    globalThis.history.pushState(null, '', '/room/existing-room-id');

    const { container, queryByRole } = render(<App />);

    expect(container.textContent).toContain('existing-room-id');
    expect(queryByRole('button', { name: /создать комнату/i })).toBeNull();
  });
});
