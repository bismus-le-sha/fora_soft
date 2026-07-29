import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import App from '../src/App.jsx';

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
        dispose: vi.fn(),
      }),
    },
  };
}

describe('App: обновление страницы во время звонка', () => {
  beforeEach(() => {
    globalThis.RTCPeerConnection = function () {};
    globalThis.isSecureContext = true;
    globalThis.navigator.mediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }),
    };
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

  it('после повторной загрузки той же вкладки сразу возвращает пользователя в комнату с прежним именем', async () => {
    const roomDeps = makeRoomDeps();
    const firstLoad = render(<App deps={{ room: roomDeps }} />);

    fireEvent.change(firstLoad.container.querySelector('input'), {
      target: { value: 'Алекс' },
    });
    fireEvent.click(firstLoad.getByRole('button', { name: /войти/i }));
    expect(await firstLoad.findByTestId('room-screen')).not.toBeNull();

    firstLoad.unmount();
    const refreshed = render(<App deps={{ room: roomDeps }} />);

    expect(await refreshed.findByTestId('room-screen')).not.toBeNull();
    await waitFor(() => {
      expect(refreshed.queryByRole('button', { name: /войти/i })).toBeNull();
    });
  });
});
