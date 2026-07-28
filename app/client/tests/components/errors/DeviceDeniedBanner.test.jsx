import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import DeviceDeniedBanner from '../../../src/components/errors/DeviceDeniedBanner.jsx';

/**
 * Задача 30 — `DeviceDeniedBanner` (Design §8 «Отказ в доступе к камере/
 * микрофону», F-33, US-12, SEC-15/SEC-21).
 */
describe('DeviceDeniedBanner (Design §8, F-33/US-12/SEC-15)', () => {
  it('рендерится как alert с обобщённым сообщением об отказе доступа', () => {
    const { getByRole } = render(<DeviceDeniedBanner />);
    expect(getByRole('alert').textContent).toContain('камере');
  });

  it('не содержит служебных тегов/DOM-инъекций (SEC-04, defense-in-depth)', () => {
    const { container } = render(<DeviceDeniedBanner />);
    expect(container.querySelectorAll('script, img, iframe').length).toBe(0);
  });
});
