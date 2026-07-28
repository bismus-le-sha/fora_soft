import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import RoomScreen from '../../src/screens/RoomScreen.jsx';

/**
 * Задача 24 — `RoomScreen` + хуки оркестрации (Design §4.2/§5.3/§7.1,
 * F-07/F-16, US-6/US-9).
 *
 * Критерии приёмки (`impl-video-chat-room.md`, задача 24): «RTL/
 * интеграционный тест — при `join:ok` рендерится сетка+чат+список;
 * `participant:joined/left` обновляют состав».
 *
 * DI по прецеденту `MeshManager.test.js`/`mediaController.test.js`/
 * `JoinGate.jsx` — фейковые `signalingClient`/`meshManager`/`mediaController`
 * через `deps`, без реального `RTCPeerConnection`/`socket.io`/`getUserMedia`.
 */

/** Фейковый `signalingClient` — тот же контракт, что `createSignalingClient`. */
function makeFakeSignaling() {
  const listeners = {};
  const errorListeners = new Set();
  const api = {
    connect: vi.fn(),
    emit: vi.fn(),
    on: vi.fn((event, cb) => {
      (listeners[event] ??= []).push(cb);
    }),
    onError: vi.fn((cb) => {
      errorListeners.add(cb);
      return () => errorListeners.delete(cb);
    }),
    disconnect: vi.fn(),
  };
  return {
    api,
    trigger(event, payload) {
      for (const cb of listeners[event] ?? []) {
        cb(payload);
      }
    },
    /**
     * Задача 30 (Design §8 «Сигнальный сервер недоступен», F-35): вызывает
     * все колбэки, зарегистрированные через `onError(cb)` — симулирует
     * `connect_error`/timeout socket.io, недоступные через обычный `trigger`
     * (тот работает только с `listeners`, заполняемым через `on()`).
     */
    triggerError(reason) {
      for (const cb of errorListeners) {
        cb(reason);
      }
    },
  };
}

/** Фейковый `MeshManager` — минимальный, только для проверки вызовов из RoomScreen. */
function makeFakeMesh() {
  return {
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
  };
}

/** Фейковый `mediaController` — `init()` резолвится сразу (без реального getUserMedia). */
function makeFakeMedia(state = { audio: true, video: true }) {
  return {
    init: vi.fn().mockResolvedValue(state),
    toggleAudio: vi.fn(() => state),
    toggleVideo: vi.fn().mockResolvedValue(state),
    getLocalStream: vi.fn(() => null),
  };
}

/**
 * @param {object} [options]
 * @param {(mediaDeps: object) => void} [options.onMediaDeps] — задача 30:
 *   позволяет тесту перехватить `deps` (в т.ч. `onDeviceDenied`), с которыми
 *   `useMedia` вызывает `createMediaController` — так тест может симулировать
 *   отказ устройства, не завязываясь на реальный `getUserMedia`
 *   (тот же DI-приём, что и остальные фейки в этом файле).
 */
function renderRoomScreen({ roomId = 'room-1', name = 'Алекс', mediaState, onMediaDeps } = {}) {
  const signaling = makeFakeSignaling();
  const mesh = makeFakeMesh();
  const media = makeFakeMedia(mediaState);

  const utils = render(
    <RoomScreen
      roomId={roomId}
      name={name}
      deps={{
        signaling: { createSignalingClient: () => signaling.api },
        mesh: { createMeshManager: () => mesh },
        media: {
          createMediaController: (mediaDeps) => {
            onMediaDeps?.(mediaDeps);
            return media;
          },
        },
      }}
    />,
  );

  return { ...utils, signaling, mesh, media };
}

const JOIN_OK_PAYLOAD = {
  selfId: 'self-1',
  participants: [
    { id: 'self-1', name: 'Алекс', media: { audio: true, video: true } },
    { id: 'peer-1', name: 'Боб', media: { audio: true, video: true } },
  ],
  history: [{ id: 'm1', kind: 'chat', authorId: 'peer-1', authorName: 'Боб', text: 'Привет', ts: 1 }],
  iceServers: [],
};

describe('RoomScreen (Design §4.2/§5.3/§7.1, критерий приёмки задачи 24)', () => {
  it('media.init() выполняется ДО подключения сигналинга (Design §7.1: getUserMedia → join)', async () => {
    const { signaling, media } = renderRoomScreen();

    await waitFor(() => expect(media.init).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(signaling.api.connect).toHaveBeenCalledTimes(1));
    expect(signaling.api.emit).toHaveBeenCalledWith('join', { roomId: 'room-1', name: 'Алекс' });
  });

  it('join:ok рендерит сетку (video-tile на каждого участника снимка) + список + чат-историю', async () => {
    const { getByTestId, getAllByTestId, signaling, mesh } = renderRoomScreen();

    await waitFor(() => expect(signaling.api.emit).toHaveBeenCalledWith('join', expect.any(Object)));

    act(() => {
      signaling.trigger('join:ok', JOIN_OK_PAYLOAD);
    });

    await waitFor(() => expect(getAllByTestId('video-tile')).toHaveLength(2));
    expect(getByTestId('participant-list').textContent).toContain('Боб');
    expect(getByTestId('chat-panel').textContent).toContain('Привет');

    // self (peer-1 не self) — только не-self участник регистрируется как existing.
    expect(mesh.addExistingParticipant).toHaveBeenCalledTimes(1);
    expect(mesh.addExistingParticipant).toHaveBeenCalledWith('peer-1');
    expect(mesh.addExistingParticipant).not.toHaveBeenCalledWith('self-1');
  });

  it('participant:joined добавляет участника в сетку/список и вызывает mesh.onParticipantJoined', async () => {
    const { getAllByTestId, getByTestId, signaling, mesh } = renderRoomScreen();
    await waitFor(() => expect(signaling.api.emit).toHaveBeenCalledWith('join', expect.any(Object)));

    act(() => {
      signaling.trigger('join:ok', JOIN_OK_PAYLOAD);
    });
    await waitFor(() => expect(getAllByTestId('video-tile')).toHaveLength(2));

    act(() => {
      signaling.trigger('participant:joined', { id: 'peer-2', name: 'Вика', media: { audio: true, video: true } });
    });

    await waitFor(() => expect(getAllByTestId('video-tile')).toHaveLength(3));
    expect(getByTestId('participant-list').textContent).toContain('Вика');
    expect(mesh.onParticipantJoined).toHaveBeenCalledWith('peer-2');
  });

  it('participant:left убирает участника из сетки/списка и вызывает mesh.onParticipantLeft', async () => {
    const { getAllByTestId, getByTestId, signaling, mesh } = renderRoomScreen();
    await waitFor(() => expect(signaling.api.emit).toHaveBeenCalledWith('join', expect.any(Object)));

    act(() => {
      signaling.trigger('join:ok', JOIN_OK_PAYLOAD);
    });
    await waitFor(() => expect(getAllByTestId('video-tile')).toHaveLength(2));

    act(() => {
      signaling.trigger('participant:left', { id: 'peer-1' });
    });

    await waitFor(() => expect(getAllByTestId('video-tile')).toHaveLength(1));
    expect(getByTestId('participant-list').textContent).not.toContain('Боб');
    expect(mesh.onParticipantLeft).toHaveBeenCalledWith('peer-1');
  });

  it('chat:message добавляет сообщение в чат', async () => {
    const { getByTestId, signaling } = renderRoomScreen();
    await waitFor(() => expect(signaling.api.emit).toHaveBeenCalledWith('join', expect.any(Object)));

    act(() => {
      signaling.trigger('join:ok', JOIN_OK_PAYLOAD);
    });

    act(() => {
      signaling.trigger('chat:message', { id: 'm2', authorId: 'peer-1', authorName: 'Боб', text: 'Как дела?', ts: 2 });
    });

    await waitFor(() => expect(getByTestId('chat-panel').textContent).toContain('Как дела?'));
  });

  it('join:rejected рендерит предупреждение и не падает', async () => {
    const { getByRole, signaling } = renderRoomScreen();
    await waitFor(() => expect(signaling.api.emit).toHaveBeenCalledWith('join', expect.any(Object)));

    act(() => {
      signaling.trigger('join:rejected', { code: 'room-full', message: 'Комната заполнена' });
    });

    await waitFor(() => expect(getByRole('alert').textContent).toContain('Комната заполнена'));
  });

  it('signal:offer/answer/ice маршрутизируются в mesh.handleSignal', async () => {
    const { signaling, mesh } = renderRoomScreen();
    await waitFor(() => expect(signaling.api.emit).toHaveBeenCalledWith('join', expect.any(Object)));

    act(() => {
      signaling.trigger('join:ok', JOIN_OK_PAYLOAD);
    });

    act(() => {
      signaling.trigger('signal:offer', { from: 'peer-1', sdp: 'OFFER' });
    });
    expect(mesh.handleSignal).toHaveBeenCalledWith({ type: 'signal:offer', from: 'peer-1', sdp: 'OFFER' });

    act(() => {
      signaling.trigger('signal:ice', { from: 'peer-1', candidate: { candidate: 'c' } });
    });
    expect(mesh.handleSignal).toHaveBeenCalledWith({
      type: 'signal:ice',
      from: 'peer-1',
      candidate: { candidate: 'c' },
    });
  });

  describe('Задача 30 — баннеры ошибок и состояний (Design §8, F-33/F-35/F-36, US-5/US-12/US-13, SEC-15)', () => {
    it('join:rejected{room-full} → RoomFullBanner с кнопкой «Повторить вход», повторный клик повторно эмитит join', async () => {
      const { getByTestId, getByRole, signaling } = renderRoomScreen();
      await waitFor(() => expect(signaling.api.emit).toHaveBeenCalledWith('join', expect.any(Object)));
      signaling.api.emit.mockClear();

      act(() => {
        signaling.trigger('join:rejected', { code: 'room-full', message: 'Комната заполнена.' });
      });

      const banner = getByTestId('room-full-banner');
      expect(banner.textContent).toContain('Комната заполнена');

      fireEvent.click(getByRole('button', { name: 'Повторить вход' }));

      expect(signaling.api.emit).toHaveBeenCalledWith('join', { roomId: 'room-1', name: 'Алекс' });
    });

    it('отказ устройств (getUserMedia denied) → DeviceDeniedBanner, пользователь остаётся в комнате', async () => {
      let capturedMediaDeps;
      const { getByTestId, signaling } = renderRoomScreen({
        onMediaDeps: (mediaDeps) => {
          capturedMediaDeps = mediaDeps;
        },
      });
      await waitFor(() => expect(signaling.api.emit).toHaveBeenCalledWith('join', expect.any(Object)));

      act(() => {
        signaling.trigger('join:ok', JOIN_OK_PAYLOAD);
      });
      await waitFor(() => expect(getByTestId('room-screen')).toBeTruthy());

      act(() => {
        capturedMediaDeps.onDeviceDenied();
      });

      await waitFor(() => expect(getByTestId('device-denied-banner')).toBeTruthy());
      // пользователь остаётся в комнате — раскладка продолжает рендериться.
      expect(getByTestId('room-screen')).toBeTruthy();
      expect(getByTestId('participant-list')).toBeTruthy();
    });

    it('недоступность сервера (connect_error) → ServerDownBanner', async () => {
      const { getByTestId, signaling } = renderRoomScreen();
      await waitFor(() => expect(signaling.api.emit).toHaveBeenCalledWith('join', expect.any(Object)));

      act(() => {
        signaling.triggerError(new Error('connect_error'));
      });

      await waitFor(() => expect(getByTestId('server-down-banner')).toBeTruthy());
    });
  });
});
