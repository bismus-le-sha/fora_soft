import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import App from '../src/App.jsx';

/**
 * Задача 20 — интеграция `JoinGate` в `App.jsx` на месте плейсхолдера
 * `/room/:roomId` (Design §4.2/§6.4/§7.1).
 *
 * Дополняет `App.navigation.test.jsx` (задача 19, не модифицируется —
 * см. preflight там же): здесь проверяется именно связка
 * `App` → `/room/:roomId` → `JoinGate` → клик «Войти» → `getUserMedia`,
 * без падения preflight-гейта задачи 17.
 */
describe('App: интеграция JoinGate на /room/:id (задача 20, Design §4.2/§7.1)', () => {
  beforeEach(() => {
    globalThis.RTCPeerConnection = function () {};
    globalThis.isSecureContext = true;
    globalThis.history.pushState(null, '', '/room/existing-room-id');
  });

  afterEach(() => {
    delete globalThis.RTCPeerConnection;
    delete globalThis.isSecureContext;
    if (globalThis.navigator) {
      delete globalThis.navigator.mediaDevices;
    }
    globalThis.history.pushState(null, '', '/');
  });

  it('на /room/:id рендерит JoinGate (поле имени + кнопка «Войти»), не плейсхолдер', () => {
    globalThis.navigator.mediaDevices = { getUserMedia: vi.fn() };

    const { getByRole, container } = render(<App />);

    expect(getByRole('button', { name: /войти/i })).not.toBeNull();
    expect(container.textContent).toContain('existing-room-id');
  });

  it('клик «Войти» с валидным именем вызывает реальный navigator.mediaDevices.getUserMedia (не падает)', async () => {
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [] });
    globalThis.navigator.mediaDevices = { getUserMedia };

    const { container, getByRole } = render(<App />);

    fireEvent.change(container.querySelector('input'), {
      target: { value: 'Алекс' },
    });
    fireEvent.click(getByRole('button', { name: /войти/i }));

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: true });
  });
});
