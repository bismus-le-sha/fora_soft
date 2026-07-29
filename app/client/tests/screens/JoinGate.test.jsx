import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import JoinGate from '../../src/screens/JoinGate.jsx';

/**
 * Задача 20 — JoinGate (Design §4.2/§7.1/§8, F-01/F-04/F-37, US-1/US-4/US-13).
 *
 * Критерии приёмки задачи 20 (`impl-video-chat-room.md`): «без имени вход
 * заблокирован; клик по «Войти» вызывает `join`». Здесь
 * «join» — контрактный проп `onJoin(name)` (Design §4.2, таблица компонентов:
 * «`JoinGate.jsx` | ... | props: `onJoin(name)`») — по тому же прецеденту,
 * что `onCreate(name)` у `StartScreen` (задача 19): сам сетевой `join`
 * (signaling) — обязанность вызывающей стороны/`RoomScreen` (задача 24), не
 * этого компонента.
 */
describe('JoinGate (Design §4.2/§7.1/§8, F-01/F-04/F-37, US-1/US-4/US-13)', () => {
  const getNameInput = (container) => container.querySelector('input');
  const getJoinButton = (getByRole, name = /войти|как вас зовут/i) =>
    getByRole('button', { name });

  it('рендерит поле ввода имени и кнопку «Войти»', () => {
    const { container, getByRole } = render(
      <JoinGate onJoin={vi.fn()} deps={{ getUserMedia: vi.fn() }} />,
    );

    expect(getNameInput(container)).not.toBeNull();
    expect(getJoinButton(getByRole)).not.toBeNull();
  });

  it('без имени остаётся кликабельной без запрещённого курсора — как кнопка создания комнаты', () => {
    const { getByRole } = render(
      <JoinGate onJoin={vi.fn()} deps={{ getUserMedia: vi.fn() }} />,
    );

    const button = getJoinButton(getByRole);
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
  });

  it('имя из одних пробелов также оставляет кнопку disabled', () => {
    const { container, getByRole } = render(
      <JoinGate onJoin={vi.fn()} deps={{ getUserMedia: vi.fn() }} />,
    );

    fireEvent.change(getNameInput(container), { target: { value: '   ' } });

    expect(getJoinButton(getByRole).getAttribute('aria-disabled')).toBe('true');
  });

  it('без имени: клик не вызывает ни getUserMedia, ни onJoin (вход не происходит)', () => {
    const getUserMedia = vi.fn();
    const onJoin = vi.fn();
    const { getByRole } = render(
      <JoinGate onJoin={onJoin} deps={{ getUserMedia }} />,
    );

    fireEvent.click(getJoinButton(getByRole));

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(onJoin).not.toHaveBeenCalled();
  });

  it('после ввода валидного имени кнопка становится активной', () => {
    const { container, getByRole } = render(
      <JoinGate onJoin={vi.fn()} deps={{ getUserMedia: vi.fn() }} />,
    );

    fireEvent.change(getNameInput(container), { target: { value: 'Алекс' } });

    expect(getJoinButton(getByRole).disabled).toBe(false);
    expect(getJoinButton(getByRole).getAttribute('aria-disabled')).toBe('false');
  });

  it('показывает ошибки для недопустимых символов и имени длиннее 30 знаков', () => {
    const { container, getByText } = render(
      <JoinGate onJoin={vi.fn()} deps={{ getUserMedia: vi.fn() }} />,
    );
    const input = getNameInput(container);

    fireEvent.change(input, { target: { value: 'Alex<' } });
    expect(getByText(/лишние символы/i)).not.toBeNull();
    expect(input.getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(input, { target: { value: 'А'.repeat(31) } });
    expect(getByText(/не больше 30 символов/i)).not.toBeNull();
    expect(input.value).toHaveLength(31);
  });

  it('разрешает подчёркивание и меняет текст невалидной CTA при наведении', () => {
    const { container, getByRole } = render(
      <JoinGate onJoin={vi.fn()} deps={{ getUserMedia: vi.fn() }} />,
    );
    const button = getJoinButton(getByRole);
    fireEvent.mouseEnter(button);
    expect(getJoinButton(getByRole, /как вас зовут/i)).not.toBeNull();

    fireEvent.change(getNameInput(container), { target: { value: 'Алекс_1' } });
    expect(getJoinButton(getByRole, /войти/i).getAttribute('aria-disabled')).toBe('false');
  });

  it('клик «Войти» с валидным именем не захватывает устройства и вызывает onJoin(name)', async () => {
    const getUserMedia = vi.fn();
    const onJoin = vi.fn();
    const { container, getByRole } = render(
      <JoinGate onJoin={onJoin} deps={{ getUserMedia }} />,
    );

    fireEvent.change(getNameInput(container), { target: { value: 'Алекс' } });
    fireEvent.click(getJoinButton(getByRole));

    await waitFor(() => expect(onJoin).toHaveBeenCalledTimes(1));

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(onJoin).toHaveBeenCalledWith('Алекс');
  });

  it('не отображает технический roomId в интерфейсе', () => {
    const { container } = render(
      <JoinGate roomId="existing-room-id" onJoin={vi.fn()} deps={{ getUserMedia: vi.fn() }} />,
    );

    expect(container.textContent).not.toContain('existing-room-id');
  });
});
