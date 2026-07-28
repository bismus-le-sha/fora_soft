import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import RoomFullBanner from '../../../src/components/errors/RoomFullBanner.jsx';

/**
 * Задача 30 — `RoomFullBanner` (Design §8 «Комната заполнена», F-33/F-35/
 * F-36, US-5, SEC-15).
 *
 * Критерий приёмки: `join:rejected{room-full}` → баннер «Комната заполнена»
 * + кнопка «Повторить вход».
 */
describe('RoomFullBanner (Design §8, F-33/US-5/SEC-15)', () => {
  it('рендерится как alert с сообщением «Комната заполнена»', () => {
    const { getByRole } = render(<RoomFullBanner onRetry={() => {}} />);
    expect(getByRole('alert').textContent).toContain('Комната заполнена');
  });

  it('содержит кнопку «Повторить вход», клик по которой вызывает onRetry', () => {
    const onRetry = vi.fn();
    const { getByRole } = render(<RoomFullBanner onRetry={onRetry} />);

    fireEvent.click(getByRole('button', { name: 'Повторить вход' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('без onRetry — клик не бросает (defense-in-depth)', () => {
    const { getByRole } = render(<RoomFullBanner />);
    expect(() => fireEvent.click(getByRole('button', { name: 'Повторить вход' }))).not.toThrow();
  });
});
