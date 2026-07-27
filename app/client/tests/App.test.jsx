import { describe, it, expect, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import App from '../src/App.jsx';

/**
 * TDD §4.2/§8, F-36, US-13, критерий приёмки задачи 17: «при отсутствии
 * RTCPeerConnection рендерится экран «не поддерживается», комната не
 * грузится». jsdom (тестовое окружение) сам по себе не реализует
 * RTCPeerConnection/getUserMedia/isSecureContext — они undefined, пока
 * тест явно их не подставит (см. `compat.js`/`compat.test.js`).
 */
describe('App: preflight-гейт поддержки WebRTC (задача 17)', () => {
  afterEach(() => {
    delete globalThis.RTCPeerConnection;
    delete globalThis.isSecureContext;
    if (globalThis.navigator) {
      delete globalThis.navigator.mediaDevices;
    }
  });

  it('окружение без RTCPeerConnection: рендерится баннер «не поддерживается», #app (комната) не рендерится', () => {
    const { container, getByRole } = render(<App />);

    expect(getByRole('alert').textContent).toContain('WebRTC не поддерживается');
    expect(container.querySelector('#app')).toBeNull();
  });

  it('полностью поддерживаемое окружение: баннер не рендерится, приложение грузится', () => {
    globalThis.RTCPeerConnection = function () {};
    globalThis.navigator.mediaDevices = { getUserMedia: () => {} };
    globalThis.isSecureContext = true;

    const { container, queryByRole } = render(<App />);

    expect(queryByRole('alert')).toBeNull();
    expect(container.querySelector('#app')).not.toBeNull();
  });
});
