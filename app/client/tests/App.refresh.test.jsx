import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';
import App from '../src/App.jsx';

function makeRoomDeps() {
  const serverHandlers = new Map();
  const mediaInit = vi.fn((initialState) => Promise.resolve(initialState));
  const roomDeps = {
    signaling: {
      createSignalingClient: () => ({
        connect: vi.fn(),
        emit: vi.fn(),
        on: vi.fn((event, handler) => serverHandlers.set(event, handler)),
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
        init: mediaInit,
        toggleAudio: vi.fn(),
        toggleVideo: vi.fn(),
        getLocalStream: vi.fn(() => null),
        dispose: vi.fn(),
      }),
    },
  };

  return {
    roomDeps,
    mediaInit,
    emitServer(event, payload) {
      serverHandlers.get(event)?.(payload);
    },
    hasServerHandler(event) {
      return serverHandlers.has(event);
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
    const { roomDeps, mediaInit, emitServer, hasServerHandler } = makeRoomDeps();
    const firstLoad = render(<App deps={{ room: roomDeps }} />);

    fireEvent.change(firstLoad.container.querySelector('input'), {
      target: { value: 'Алекс' },
    });
    fireEvent.click(firstLoad.getByRole('button', { name: /войти/i }));
    expect(await firstLoad.findByTestId('room-screen')).not.toBeNull();
    await waitFor(() => expect(hasServerHandler('join:ok')).toBe(true));
    act(() => {
      emitServer('join:ok', {
        selfId: 'self-1',
        participants: [{ id: 'self-1', name: 'Алекс', media: { audio: false, video: false } }],
        history: [],
        iceServers: [],
      });
    });
    expect(JSON.parse(sessionStorage.getItem('video-chat-room:active-session'))).toEqual({
      roomId: 'existing-room-id',
      name: 'Алекс',
      media: { audio: false, video: false },
    });

    firstLoad.unmount();
    mediaInit.mockClear();
    const refreshed = render(<App deps={{ room: roomDeps }} />);

    expect(await refreshed.findByTestId('media-rejoin-prompt')).not.toBeNull();
    expect(refreshed.queryByTestId('room-screen')).toBeNull();
    fireEvent.click(refreshed.getByRole('button', { name: /^продолжить$/i }));
    expect(await refreshed.findByTestId('room-screen')).not.toBeNull();
    await waitFor(() =>
      expect(mediaInit).toHaveBeenCalledWith({ audio: false, video: false }),
    );
  });

  it('позволяет включить только микрофон перед повторным входом', async () => {
    const { roomDeps, mediaInit } = makeRoomDeps();
    sessionStorage.setItem(
      'video-chat-room:active-session',
      JSON.stringify({
        roomId: 'existing-room-id',
        name: 'Алекс',
        media: { audio: false, video: false },
      }),
    );

    const refreshed = render(<App deps={{ room: roomDeps }} />);
    expect(await refreshed.findByTestId('media-rejoin-prompt')).not.toBeNull();

    const microphone = refreshed.getByRole('switch', { name: /микрофон/i });
    const camera = refreshed.getByRole('switch', { name: /камера/i });
    expect(microphone.getAttribute('aria-checked')).toBe('false');
    expect(camera.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(microphone);
    expect(microphone.getAttribute('aria-checked')).toBe('true');
    expect(camera.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(refreshed.getByRole('button', { name: /^продолжить$/i }));

    expect(await refreshed.findByTestId('room-screen')).not.toBeNull();
    await waitFor(() =>
      expect(mediaInit).toHaveBeenCalledWith({ audio: true, video: false }),
    );
    expect(JSON.parse(sessionStorage.getItem('video-chat-room:active-session')).media).toEqual({
      audio: true,
      video: false,
    });
  });

  it('не сохраняет имя до join:ok, если сервер отклонил вход', async () => {
    const { roomDeps, emitServer, hasServerHandler } = makeRoomDeps();
    const firstLoad = render(<App deps={{ room: roomDeps }} />);

    fireEvent.change(firstLoad.container.querySelector('input'), {
      target: { value: 'Алекс' },
    });
    fireEvent.click(firstLoad.getByRole('button', { name: /войти/i }));
    expect(await firstLoad.findByTestId('room-screen')).not.toBeNull();
    await waitFor(() => expect(hasServerHandler('join:rejected')).toBe(true));
    act(() => {
      emitServer('join:rejected', { code: 'room-full' });
    });

    firstLoad.unmount();
    const refreshed = render(<App deps={{ room: roomDeps }} />);

    expect(await refreshed.findByRole('button', { name: /войти/i })).not.toBeNull();
  });
});
