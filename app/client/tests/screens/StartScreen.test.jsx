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

  it('marks button as aria-disabled for empty name', () => {
    const { getByRole } = render(<StartScreen onCreate={vi.fn()} />);
    expect(getCreateButton(getByRole).getAttribute('aria-disabled')).toBe('true');
  });

  it('keeps button invalid for whitespace-only name', () => {
    const { container, getByRole } = render(<StartScreen onCreate={vi.fn()} />);
    fireEvent.change(getNameInput(container), { target: { value: '   ' } });
    expect(getCreateButton(getByRole).getAttribute('aria-disabled')).toBe('true');
  });

  it('activates button for a valid name', () => {
    const { container, getByRole } = render(<StartScreen onCreate={vi.fn()} />);
    fireEvent.change(getNameInput(container), { target: { value: 'Алекс' } });
    expect(getCreateButton(getByRole, /создать комнату/i).getAttribute('aria-disabled')).toBe('false');
  });

  it('shows validation for invalid characters', () => {
    const { container, getByText } = render(<StartScreen onCreate={vi.fn()} />);
    fireEvent.change(getNameInput(container), { target: { value: 'Alex<' } });
    expect(getByText(/можно использовать буквы/i)).not.toBeNull();
  });

  it('hovering invalid CTA changes copy instead of showing a disabled cursor state', () => {
    const { getByRole } = render(<StartScreen onCreate={vi.fn()} />);
    const button = getCreateButton(getByRole, /создать комнату/i);
    fireEvent.mouseEnter(button);
    expect(getByRole('button', { name: /как вас зовут/i })).not.toBeNull();
  });

  it('calls onCreate(name) once with a trimmed valid name', () => {
    const onCreate = vi.fn();
    const { container, getByRole } = render(<StartScreen onCreate={onCreate} />);
    fireEvent.change(getNameInput(container), { target: { value: '  Алекс  ' } });
    fireEvent.click(getCreateButton(getByRole, /создать комнату/i));
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
