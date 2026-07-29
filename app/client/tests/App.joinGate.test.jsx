import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import App from '../src/App.jsx';

/**
 * Задача 20 — интеграция `JoinGate` в `App.jsx` на месте плейсхолдера
 * `/room/:roomId` (Design §4.2/§6.4/§7.1).
 *
 * Дополняет `App.navigation.test.jsx` (задача 19, не модифицируется —
 * см. preflight там же): здесь проверяется именно связка
 * `App` → `/room/:roomId` → `JoinGate` → клик «Войти» → `getUserMedia`,
 * без падения preflight-гейта задачи 17.
 */
describe('App: интеграция JoinGate на /room/:id (задача 20, Design §4.2/§7.1)', () => {
  beforeEach(() => {
    globalThis.RTCPeerConnection = function () {};
    globalThis.isSecureContext = true;
    globalThis.history.pushState(null, '', '/room/existing-room-id');
    globalThis.sessionStorage.clear();
    // Задача 32 (E2E): после `onJoin` рендерится реальный `RoomScreen` →
    // реальный `ChatPanel.jsx` — jsdom не реализует
    // `Element.prototype.scrollIntoView` (тот же полифилл-мок, что уже
    // используется в `tests/components/ChatPanel.test.jsx`/`RoomScreen.test.jsx`).
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

  it('на /room/:id рендерит JoinGate (поле имени + кнопка «Войти»), не плейсхолдер', () => {
    globalThis.navigator.mediaDevices = { getUserMedia: vi.fn() };

    const { getByRole, container } = render(<App />);

    expect(getByRole('button', { name: /войти/i })).not.toBeNull();
    expect(container.textContent).not.toContain('existing-room-id');
  });

  it('клик «Войти» с валидным именем не захватывает устройства по умолчанию', async () => {
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [] });
    globalThis.navigator.mediaDevices = { getUserMedia };

    // RoomScreen изолирован через DI, чтобы тест не открывал socket.io.
    // Его init возвращает оба устройства off и тоже не обращается к браузеру.
    const roomDeps = {
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

    const { container, getByRole } = render(<App deps={{ room: roomDeps }} />);

    fireEvent.change(container.querySelector('input'), {
      target: { value: 'Алекс' },
    });
    fireEvent.click(getByRole('button', { name: /войти/i }));

    await waitFor(() => expect(container.querySelector('[data-testid="room-screen"]')).not.toBeNull());
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('клик «Войти» переключает рендер с JoinGate на RoomScreen (Design §4.2/§7.1, задача 24)', async () => {
    globalThis.navigator.mediaDevices = { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }) };

    const roomDeps = {
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

    const { container, getByRole, queryByRole, findByTestId } = render(<App deps={{ room: roomDeps }} />);

    fireEvent.change(container.querySelector('input'), {
      target: { value: 'Алекс' },
    });
    fireEvent.click(getByRole('button', { name: /войти/i }));

    expect(await findByTestId('room-screen')).not.toBeNull();
    expect(queryByRole('button', { name: /войти/i })).toBeNull();
  });
});
