import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import StartScreen from '../../src/screens/StartScreen.jsx';

describe('StartScreen', () => {
  const getNameInput = (container) => container.querySelector('input');
  const getCreateButton = (getByRole, name = /создать комнату|как вас зовут/i) =>
    getByRole('button', { name });

  it('renders name input and create button', () => {
    const { container, getByRole } = render(<StartScreen onCreate={vi.fn()} />);
    expect(getNameInput(container)).not.toBeNull();
    expect(getCreateButton(getByRole)).not.toBeNull();
  });

  it('keeps the empty-name CTA clickable without a forbidden cursor', () => {
    const { getByRole } = render(<StartScreen onCreate={vi.fn()} />);
    const button = getCreateButton(getByRole);
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
  });

  it('keeps button invalid for whitespace-only name', () => {
    const { container, getByRole } = render(<StartScreen onCreate={vi.fn()} />);
    fireEvent.change(getNameInput(container), { target: { value: '   ' } });
    expect(getCreateButton(getByRole).getAttribute('aria-disabled')).toBe('true');
  });

  it('activates button for a valid name', () => {
    const { container, getByRole } = render(<StartScreen onCreate={vi.fn()} />);
    fireEvent.change(getNameInput(container), { target: { value: 'Алекс' } });
    expect(getCreateButton(getByRole).disabled).toBe(false);
    expect(getCreateButton(getByRole).getAttribute('aria-disabled')).toBe('false');
  });

  it('shows validation for invalid characters and an overlong name', () => {
    const { container, getByText } = render(<StartScreen onCreate={vi.fn()} />);
    const input = getNameInput(container);

    fireEvent.change(input, { target: { value: 'Alex<' } });
    expect(getByText(/лишние символы/i)).not.toBeNull();
    expect(input.getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(input, { target: { value: 'А'.repeat(31) } });
    expect(getByText(/не больше 30 символов/i)).not.toBeNull();
    expect(input.value).toHaveLength(31);
  });

  it('allows underscore and changes invalid CTA copy on hover', () => {
    const { container, getByRole } = render(<StartScreen onCreate={vi.fn()} />);
    const button = getCreateButton(getByRole);
    fireEvent.mouseEnter(button);
    expect(getCreateButton(getByRole, /как вас зовут/i)).not.toBeNull();

    fireEvent.change(getNameInput(container), { target: { value: 'Алекс_1' } });
    expect(getCreateButton(getByRole, /создать комнату/i).getAttribute('aria-disabled')).toBe('false');
  });

  it('calls onCreate(name) once with a trimmed valid name', () => {
    const onCreate = vi.fn();
    const { container, getByRole } = render(<StartScreen onCreate={onCreate} />);
    fireEvent.change(getNameInput(container), { target: { value: '  Алекс  ' } });
    fireEvent.click(getCreateButton(getByRole));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith('Алекс');
  });

  it('does not call onCreate for an invalid name', () => {
    const onCreate = vi.fn();
    const { getByRole } = render(<StartScreen onCreate={onCreate} />);
    fireEvent.click(getCreateButton(getByRole));
    expect(onCreate).not.toHaveBeenCalled();
  });
});
