import { describe, it, expect, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
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

function renderRoomScreen({ roomId = 'room-1', name = 'Алекс' } = {}) {
  const signaling = makeFakeSignaling();
  const mesh = makeFakeMesh();
  const media = makeFakeMedia();

  const utils = render(
    <RoomScreen
      roomId={roomId}
      name={name}
      deps={{
        signaling: { createSignalingClient: () => signaling.api },
        mesh: { createMeshManager: () => mesh },
        media: { createMediaController: () => media },
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
});
