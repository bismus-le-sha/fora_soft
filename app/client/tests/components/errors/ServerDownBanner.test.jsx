import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ServerDownBanner from '../../../src/components/errors/ServerDownBanner.jsx';

/**
 * Задача 30 — `ServerDownBanner` (Design §8 «Сигнальный сервер недоступен»,
 * F-35, US-13, SEC-15).
 */
describe('ServerDownBanner (Design §8, F-35/US-13/SEC-15)', () => {
  it('рендерится как alert с сообщением «Не получается связаться с сервером»', () => {
    const { getByRole } = render(<ServerDownBanner />);
    expect(getByRole('alert').textContent).toContain('Не получается связаться с сервером');
  });

  it('не содержит служебных тегов/DOM-инъекций (SEC-04, defense-in-depth)', () => {
    const { container } = render(<ServerDownBanner />);
    expect(container.querySelectorAll('script, img, iframe').length).toBe(0);
  });
});
