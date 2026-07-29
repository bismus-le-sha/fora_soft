import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import RoomFullBanner from '../../../src/components/errors/RoomFullBanner.jsx';

/**
 * Задача 30 — `RoomFullBanner` (Design §8 «Комната заполнена», F-33/F-35/
 * F-36, US-5, SEC-15). Копирайт сверен дословно с README §9 в задаче 43.
 *
 * Критерий приёмки: `join:rejected{room-full}` → баннер «Похоже, комната уже
 * занята» + кнопка «Попробовать снова».
 */
describe('RoomFullBanner (Design §8, F-33/US-5/SEC-15)', () => {
  it('рендерится как alert с сообщением «Похоже, комната уже занята»', () => {
    const { getByRole } = render(<RoomFullBanner onRetry={() => {}} />);
    expect(getByRole('alert').textContent).toContain('Похоже, комната уже занята');
  });

  it('содержит кнопку «Попробовать снова», клик по которой вызывает onRetry', () => {
    const onRetry = vi.fn();
    const { getByRole } = render(<RoomFullBanner onRetry={onRetry} />);

    fireEvent.click(getByRole('button', { name: 'Попробовать снова' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('без onRetry — клик не бросает (defense-in-depth)', () => {
    const { getByRole } = render(<RoomFullBanner />);
    expect(() => fireEvent.click(getByRole('button', { name: 'Попробовать снова' }))).not.toThrow();
  });

  it('содержит ссылку «Своя комната», ведущую на стартовый экран (README §9 копирайт)', () => {
    const { getByRole } = render(<RoomFullBanner onRetry={() => {}} />);
    const link = getByRole('link', { name: 'Своя комната' });
    expect(link.getAttribute('href')).toBe('/');
  });
});
