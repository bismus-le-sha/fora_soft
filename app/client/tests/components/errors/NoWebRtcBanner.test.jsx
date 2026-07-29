import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import NoWebRtcBanner from '../../../src/components/errors/NoWebRtcBanner.jsx';

describe('NoWebRtcBanner (F-36, US-13)', () => {
  it('рендерится как alert с понятным сообщением о неподдержке WebRTC', () => {
    const { getByRole } = render(<NoWebRtcBanner />);
    const alert = getByRole('alert');
    expect(alert.textContent).toContain('Этот браузер не умеет видеозвонки');
  });

  it('текст сообщения — обычный текстовый узел, а не innerHTML (SEC-04, defense-in-depth)', () => {
    const { container } = render(<NoWebRtcBanner />);
    // Нет тегов, кроме собственной, статически заданной разметки компонента.
    expect(container.querySelectorAll('script, img, iframe').length).toBe(0);
  });
});
