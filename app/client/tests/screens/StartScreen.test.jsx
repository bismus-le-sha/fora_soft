import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import StartScreen from '../../src/screens/StartScreen.jsx';

/**
 * Задача 19.2 (red-фаза, покрытие для implementer) — StartScreen.
 *
 * Требования: F-01, F-02, US-1, US-2. Design: §4.2 (таблица: `StartScreen.jsx`,
 * props `onCreate(name)`), §6.4 (URL-контракт: «Создать комнату» → генерация
 * roomId → navigate(/room/:id)).
 *
 * Критерии приёмки задачи 19: «пустое имя блокирует кнопку (UX); переход на
 * /room/:id». Навигация/генерация roomId запускается через контрактный проп
 * `onCreate(name)` (Design §4.2) — сама генерация id проверяется в
 * roomId.test.js, здесь проверяется, что валидный сабмит его ТРИГГЕРИТ, а
 * пустое имя — нет.
 *
 * Тесты падают до реализации `src/screens/StartScreen.jsx` (модуль ещё не
 * существует — ожидаемый red по задаче 19.2, который закроет implementer).
 */
describe('StartScreen (Design §4.2/§6.4, F-01/F-02, US-1/US-2)', () => {
  const getNameInput = (container) => container.querySelector('input');
  const getCreateButton = (getByRole) => getByRole('button', { name: /создать комнату/i });

  it('рендерит поле ввода имени и кнопку «Создать комнату»', () => {
    const { container, getByRole } = render(<StartScreen onCreate={vi.fn()} />);

    expect(getNameInput(container)).not.toBeNull();
    expect(getCreateButton(getByRole)).not.toBeNull();
  });

  it('пустое имя блокирует кнопку (UX-валидация, US-1 «Пустое имя»)', () => {
    const { getByRole } = render(<StartScreen onCreate={vi.fn()} />);

    expect(getCreateButton(getByRole).disabled).toBe(true);
  });

  it('имя из одних пробелов также блокирует кнопку (US-1)', () => {
    const { container, getByRole } = render(<StartScreen onCreate={vi.fn()} />);

    fireEvent.change(getNameInput(container), { target: { value: '   ' } });

    expect(getCreateButton(getByRole).disabled).toBe(true);
  });

  it('после ввода валидного имени кнопка становится активной', () => {
    const { container, getByRole } = render(<StartScreen onCreate={vi.fn()} />);

    fireEvent.change(getNameInput(container), { target: { value: 'Алекс' } });

    expect(getCreateButton(getByRole).disabled).toBe(false);
  });

  it('клик «Создать комнату» с валидным именем вызывает onCreate(name) ровно один раз (триггер генерации roomId + navigate, §6.4)', () => {
    const onCreate = vi.fn();
    const { container, getByRole } = render(<StartScreen onCreate={onCreate} />);

    fireEvent.change(getNameInput(container), { target: { value: 'Алекс' } });
    fireEvent.click(getCreateButton(getByRole));

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith('Алекс');
  });

  it('пустое имя: onCreate не вызывается даже при попытке клика (вход не происходит, US-1/US-2)', () => {
    const onCreate = vi.fn();
    const { getByRole } = render(<StartScreen onCreate={onCreate} />);

    fireEvent.click(getCreateButton(getByRole));

    expect(onCreate).not.toHaveBeenCalled();
  });
});
