import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import App from '../src/App.jsx';

/**
 * Баг-фикс задачи 42 (`ExitConfirmModal.jsx`): подтверждённый выход
 * (`exit-confirm-leave`) эмитил `leave` на сервер, но никак не сообщал
 * `App.jsx` — пользователь визуально оставался на экране комнаты (баг
 * найден пользователем при ручной проверке модалки). Дополняет
 * `App.joinGate.test.jsx` (задача 20, не модифицируется) тем же DI-приёмом
 * (`deps.room`) — здесь проверяется именно связка
 * `RoomScreen.onLeave` → `App.handleRoomLeave` → возврат на `/` (StartScreen),
 * README §7 «После выхода — возврат на стартовый экран ввода имени».
 */
function makeRoomDeps() {
  return {
    signaling: {
      createSignalingClient: () => ({
        connect: vi.fn(),
        emit: vi.fn(),
        on: vi.fn(),
        onError: vi.fn(() => () => {}),
        disconnect: vi.fn(),
      }),
    },
    mesh: {
      createMeshManager: () => ({
        onParticipantJoined: vi.fn(),
        addExistingParticipant: vi.fn(),
        onParticipantLeft: vi.fn(),
        handleSignal: vi.fn(),
        attachLocalTrack: vi.fn(),
        getVideoSenders: vi.fn(() => []),
        getRemoteStream: vi.fn(() => null),
        getPeerIds: vi.fn(() => []),
        onRemoteStream: vi.fn(() => () => {}),
        closeAll: vi.fn(),
      }),
    },
    media: {
      createMediaController: () => ({
        init: vi.fn().mockResolvedValue({ audio: false, video: false }),
        toggleAudio: vi.fn(),
        toggleVideo: vi.fn(),
        getLocalStream: vi.fn(() => null),
      }),
    },
  };
}

describe('App: подтверждённый выход возвращает на StartScreen (баг-фикс задачи 42)', () => {
  beforeEach(() => {
    globalThis.RTCPeerConnection = function () {};
    globalThis.isSecureContext = true;
    globalThis.navigator.mediaDevices = { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }) };
    globalThis.history.pushState(null, '', '/room/existing-room-id');
    globalThis.sessionStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    globalThis.sessionStorage.clear();
    delete globalThis.RTCPeerConnection;
    delete globalThis.isSecureContext;
    if (globalThis.navigator) {
      delete globalThis.navigator.mediaDevices;
    }
    globalThis.history.pushState(null, '', '/');
  });

  it('«Войти» → «Выйти» → «Выйти» в модалке возвращает на StartScreen и меняет URL на "/"', async () => {
    const { container, getByRole, findByTestId, getByTestId, queryByTestId } = render(
      <App deps={{ room: makeRoomDeps() }} />,
    );

    fireEvent.change(container.querySelector('input'), { target: { value: 'Алекс' } });
    fireEvent.click(getByRole('button', { name: /войти/i }));

    expect(await findByTestId('room-screen')).not.toBeNull();

    fireEvent.click(getByTestId('leave-button'));
    fireEvent.click(getByTestId('exit-confirm-leave'));

    await waitFor(() => expect(getByRole('button', { name: /создать комнату/i })).not.toBeNull());
    expect(queryByTestId('room-screen')).toBeNull();
    expect(globalThis.location.pathname).toBe('/');
    expect(globalThis.sessionStorage.length).toBe(0);
  });
});
