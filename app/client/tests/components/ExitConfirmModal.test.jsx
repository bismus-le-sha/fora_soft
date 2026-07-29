import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import ExitConfirmModal from '../../src/components/ExitConfirmModal.jsx';
import { EXIT_CONFIRM } from '../../src/components/ExitConfirmModal.content.js';

/**
 * Задача 42 — `ExitConfirmModal` (Design addendum §3, NEW; README §7
 * «Подтверждение выхода»).
 *
 * Критерии приёмки (`impl-video-chat-room.md`, задача 42): «Остаться»
 * закрывает без эмита, «Выйти» в модалке эмитит `leave» — оба поведения на
 * самом деле принадлежат `RoomScreen.jsx` (см. его тесты, задача 38/42), этот
 * компонент только презентационный — здесь проверяется, что клики вызывают
 * правильные колбэки и копирайт совпадает дословно с README §7.
 */
function renderModal(props = {}) {
  const onStay = vi.fn();
  const onConfirmLeave = vi.fn();
  const utils = render(
    <ExitConfirmModal onStay={onStay} onConfirmLeave={onConfirmLeave} {...props} />,
  );
  return { ...utils, onStay, onConfirmLeave };
}

describe('ExitConfirmModal', () => {
  it('рендерит диалог с копирайтом README §7 дословно', () => {
    const { getByTestId, getByText } = renderModal();

    const dialog = getByTestId('exit-confirm');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(getByText(EXIT_CONFIRM.eyebrow)).toBeTruthy();
    expect(getByText(EXIT_CONFIRM.question)).toBeTruthy();
    expect(getByText(EXIT_CONFIRM.body)).toBeTruthy();
    expect(getByText(EXIT_CONFIRM.stayLabel)).toBeTruthy();
    expect(getByText(EXIT_CONFIRM.leaveLabel)).toBeTruthy();
  });

  it('клик «Остаться» вызывает onStay, не onConfirmLeave', () => {
    const { getByTestId, onStay, onConfirmLeave } = renderModal();

    fireEvent.click(getByTestId('exit-confirm-stay'));

    expect(onStay).toHaveBeenCalledTimes(1);
    expect(onConfirmLeave).not.toHaveBeenCalled();
  });

  it('клик «Выйти» вызывает onConfirmLeave, не onStay', () => {
    const { getByTestId, onStay, onConfirmLeave } = renderModal();

    fireEvent.click(getByTestId('exit-confirm-leave'));

    expect(onConfirmLeave).toHaveBeenCalledTimes(1);
    expect(onStay).not.toHaveBeenCalled();
  });
});
