import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import JoinGate from '../../src/screens/JoinGate.jsx';

/**
 * Задача 20 — JoinGate (Design §4.2/§7.1/§8, F-01/F-04/F-37, US-1/US-4/US-13).
 *
 * Критерии приёмки задачи 20 (`impl-video-chat-room.md`): «без имени вход
 * заблокирован; клик по «Войти» вызывает `getUserMedia` и `join`». Здесь
 * «join» — контрактный проп `onJoin(name)` (Design §4.2, таблица компонентов:
 * «`JoinGate.jsx` | ... | props: `onJoin(name)`») — по тому же прецеденту,
 * что `onCreate(name)` у `StartScreen` (задача 19): сам сетевой `join`
 * (signaling) — обязанность вызывающей стороны/`RoomScreen` (задача 24), не
 * этого компонента.
 *
 * `getUserMedia` инжектируется через `deps` (тот же DI-приём, что `target` в
 * `lib/compat.js` и `deps.io` в `signalingClient.js`) — без мутации
 * глобального `navigator`.
 */
describe('JoinGate (Design §4.2/§7.1/§8, F-01/F-04/F-37, US-1/US-4/US-13)', () => {
  const getNameInput = (container) => container.querySelector('input');
  const getJoinButton = (getByRole) => getByRole('button', { name: /войти/i });

  function fakeStream(tracks) {
    return { getTracks: () => tracks };
  }

  function fakeTrack() {
    return { stop: vi.fn() };
  }

  it('рендерит поле ввода имени и кнопку «Войти»', () => {
    const { container, getByRole } = render(
      <JoinGate onJoin={vi.fn()} deps={{ getUserMedia: vi.fn() }} />,
    );

    expect(getNameInput(container)).not.toBeNull();
    expect(getJoinButton(getByRole)).not.toBeNull();
  });

  it('без имени вход заблокирован: кнопка «Войти» disabled', () => {
    const { getByRole } = render(
      <JoinGate onJoin={vi.fn()} deps={{ getUserMedia: vi.fn() }} />,
    );

    expect(getJoinButton(getByRole).disabled).toBe(true);
  });

  it('имя из одних пробелов также блокирует кнопку', () => {
    const { container, getByRole } = render(
      <JoinGate onJoin={vi.fn()} deps={{ getUserMedia: vi.fn() }} />,
    );

    fireEvent.change(getNameInput(container), { target: { value: '   ' } });

    expect(getJoinButton(getByRole).disabled).toBe(true);
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
  });

  it('клик «Войти» с валидным именем вызывает getUserMedia(audio+video) и onJoin(name) (user-gesture, F-37)', async () => {
    const track = fakeTrack();
    const getUserMedia = vi.fn().mockResolvedValue(fakeStream([track]));
    const onJoin = vi.fn();
    const { container, getByRole } = render(
      <JoinGate onJoin={onJoin} deps={{ getUserMedia }} />,
    );

    fireEvent.change(getNameInput(container), { target: { value: 'Алекс' } });
    fireEvent.click(getJoinButton(getByRole));

    await waitFor(() => expect(onJoin).toHaveBeenCalledTimes(1));

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: true });
    expect(onJoin).toHaveBeenCalledWith('Алекс');
    // Первичный поток — только «прайминг» жеста/разрешения, не сохраняется.
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it('отказ getUserMedia (reject) не роняет компонент и всё равно вызывает onJoin (Design §8 «Отказ в доступе»)', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new Error('Permission denied'));
    const onJoin = vi.fn();
    const { container, getByRole, findByRole } = render(
      <JoinGate onJoin={onJoin} deps={{ getUserMedia }} />,
    );

    fireEvent.change(getNameInput(container), { target: { value: 'Алекс' } });
    fireEvent.click(getJoinButton(getByRole));

    await waitFor(() => expect(onJoin).toHaveBeenCalledTimes(1));
    expect(onJoin).toHaveBeenCalledWith('Алекс');
    expect(await findByRole('alert')).not.toBeNull();
  });

  it('отображает roomId (UX — видно, в какую комнату входишь)', () => {
    const { container } = render(
      <JoinGate roomId="existing-room-id" onJoin={vi.fn()} deps={{ getUserMedia: vi.fn() }} />,
    );

    expect(container.textContent).toContain('existing-room-id');
  });
});
