import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import App from '../src/App.jsx';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
        onRemoteStream: vi.fn(() => () => {}),
        closeAll: vi.fn(),
      }),
    },
    media: {
      createMediaController: () => ({
        init: vi.fn(() => Promise.resolve({ audio: true, video: true })),
        toggleAudio: vi.fn(() => ({ audio: true, video: true })),
        toggleVideo: vi.fn(() => Promise.resolve({ audio: true, video: true })),
        getLocalStream: vi.fn(() => null),
        onStateChange: vi.fn(() => () => {}),
        dispose: vi.fn(),
      }),
    },
  };
}

describe('App navigation', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    globalThis.RTCPeerConnection = function MockRtc() {};
    globalThis.navigator.mediaDevices = { getUserMedia: vi.fn() };
    globalThis.isSecureContext = true;
    globalThis.history.pushState(null, '', '/');
  });

  afterEach(() => {
    delete globalThis.RTCPeerConnection;
    delete globalThis.isSecureContext;
    delete globalThis.navigator.mediaDevices;
    globalThis.history.pushState(null, '', '/');
  });

  it('renders StartScreen on "/"', () => {
    const { getByRole } = render(<App deps={{ room: makeRoomDeps() }} />);
    expect(getByRole('button', { name: /создать комнату/i })).not.toBeNull();
  });

  it('creating a room with a valid name navigates to /room/:id and enters the room directly', async () => {
    const { container, getByRole, queryByText, findByTestId } = render(<App deps={{ room: makeRoomDeps() }} />);

    fireEvent.change(container.querySelector('input'), { target: { value: 'Алекс' } });
    fireEvent.click(getByRole('button', { name: /создать комнату/i }));

    const match = /^\/room\/([0-9a-f-]+)$/.exec(globalThis.location.pathname);
    expect(match).not.toBeNull();
    expect(match[1]).toMatch(UUID_V4);
    expect(queryByText(/вас ждут в комнате/i)).toBeNull();
    expect(await findByTestId('room-screen')).toBeTruthy();
  });

  it('empty name does not navigate away from "/"', () => {
    const { getByRole } = render(<App deps={{ room: makeRoomDeps() }} />);
    fireEvent.click(getByRole('button', { name: /создать комнату|как вас зовут/i }));
    expect(globalThis.location.pathname).toBe('/');
  });

  it('direct /room/:id visit still renders JoinGate first', async () => {
    globalThis.history.pushState(null, '', '/room/existing-room-id');
    const { container, findByRole, queryByRole } = render(<App deps={{ room: makeRoomDeps() }} />);
    expect(await findByRole('button', { name: /войти/i })).not.toBeNull();
    expect(container.textContent).not.toContain('existing-room-id');
    expect(queryByRole('button', { name: /создать комнату/i })).toBeNull();
  });
});
