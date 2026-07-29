import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import RoomScreen from '../../src/screens/RoomScreen.jsx';

// Задача 32 (E2E): `RoomScreen` теперь рендерит реальный `ChatPanel.jsx`
// (ранее — инлайн-заглушка без автоскролла) — jsdom не реализует
// `Element.prototype.scrollIntoView` (тот же полифилл-мок, что уже
// используется в `tests/components/ChatPanel.test.jsx`).
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

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
function makeFakeMedia(state = { audio: true, video: true }, initResult) {
  return {
    init: vi.fn(() => initResult ?? Promise.resolve(state)),
    toggleAudio: vi.fn().mockResolvedValue(state),
    toggleVideo: vi.fn().mockResolvedValue(state),
    getLocalStream: vi.fn(() => null),
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

/**
 * @param {object} [options]
 * @param {(mediaDeps: object) => void} [options.onMediaDeps] — задача 30:
 *   позволяет тесту перехватить `deps` (в т.ч. `onDeviceDenied`), с которыми
 *   `useMedia` вызывает `createMediaController` — так тест может симулировать
 *   отказ устройства, не завязываясь на реальный `getUserMedia`
 *   (тот же DI-приём, что и остальные фейки в этом файле).
 * @param {Promise<object>} [options.mediaInitResult] — задача 37:
 *   контролируемый результат `media.init()` для проверки промежуточного
 *   экрана подготовки к доступу.
 */
function renderRoomScreen({
  roomId = 'room-1',
  name = 'Алекс',
  mediaState,
  mediaInitResult,
  initialMediaState,
  onMediaStateChange,
  onMediaDeps,
  onLeave,
} = {}) {
  const signaling = makeFakeSignaling();
  const mesh = makeFakeMesh();
  const media = makeFakeMedia(mediaState, mediaInitResult);

  const utils = render(
    <RoomScreen
      roomId={roomId}
      name={name}
      initialMediaState={initialMediaState}
      onMediaStateChange={onMediaStateChange}
      onLeave={onLeave}
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
  it('показывает экран подготовки к доступу до завершения media.init(), затем скрывает его', async () => {
    const mediaInit = deferred();
    const { queryByTestId, findByTestId, signaling } = renderRoomScreen({
      mediaInitResult: mediaInit.promise,
    });

    expect(await findByTestId('permission-prep')).toBeTruthy();
    expect(queryByTestId('room-screen')).toBeNull();
    expect(signaling.api.connect).not.toHaveBeenCalled();

    await act(async () => {
      mediaInit.resolve({ audio: true, video: true });
      await mediaInit.promise;
    });

    await waitFor(() => expect(queryByTestId('permission-prep')).toBeNull());
    expect(await findByTestId('room-screen')).toBeTruthy();
    await waitFor(() => expect(signaling.api.connect).toHaveBeenCalledTimes(1));
  });

  it('media.init() выполняется ДО подключения сигналинга (Design §7.1: getUserMedia → join)', async () => {
    const { signaling, media } = renderRoomScreen();

    await waitFor(() => expect(media.init).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(signaling.api.connect).toHaveBeenCalledTimes(1));
    expect(signaling.api.emit).toHaveBeenCalledWith('join', { roomId: 'room-1', name: 'Алекс' });
  });

  it('после join:ok синхронизирует с сервером текущее начальное состояние устройств', async () => {
    const mediaState = { audio: false, video: false };
    const { signaling } = renderRoomScreen({ mediaState });

    await waitFor(() => expect(signaling.api.emit).toHaveBeenCalledWith('join', expect.any(Object)));
    signaling.api.emit.mockClear();

    act(() => {
      signaling.trigger('join:ok', JOIN_OK_PAYLOAD);
    });

    expect(signaling.api.emit).toHaveBeenCalledWith('media:state', mediaState);
  });

  it('передаёт сохранённый выбор устройств в media.init() и сообщает фактическое состояние наверх', async () => {
    const initialMediaState = { audio: false, video: true };
    const onMediaStateChange = vi.fn();
    const { media } = renderRoomScreen({
      initialMediaState,
      mediaState: initialMediaState,
      onMediaStateChange,
    });

    await waitFor(() => expect(media.init).toHaveBeenCalledWith(initialMediaState));
    await waitFor(() =>
      expect(onMediaStateChange).toHaveBeenCalledWith('room-1', initialMediaState),
    );
  });

  it('подключает впервые включённую дорожку к mesh после успешного входа', async () => {
    let capturedMediaDeps;
    const { signaling, mesh } = renderRoomScreen({
      onMediaDeps: (mediaDeps) => {
        capturedMediaDeps = mediaDeps;
      },
    });
    await waitFor(() => expect(signaling.api.emit).toHaveBeenCalledWith('join', expect.any(Object)));
    act(() => {
      signaling.trigger('join:ok', JOIN_OK_PAYLOAD);
    });
    const track = { kind: 'audio' };
    const stream = { id: 'local-stream' };

    act(() => {
      capturedMediaDeps.onLocalTrackAdded(track, stream);
    });

    expect(mesh.attachLocalTrack).toHaveBeenCalledWith(track, stream);
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

  it('локальная плитка отражает фактическое отсутствие камеры и выключенный микрофон, а не состояние из join:ok', async () => {
    const { getAllByTestId, signaling } = renderRoomScreen({
      mediaState: { audio: false, video: false },
    });
    await waitFor(() => expect(signaling.api.emit).toHaveBeenCalledWith('join', expect.any(Object)));

    act(() => {
      signaling.trigger('join:ok', JOIN_OK_PAYLOAD);
    });

    const selfTile = await waitFor(() => {
      const tile = getAllByTestId('video-tile').find((candidate) => candidate.textContent.includes('Алекс'));
      expect(tile).toBeTruthy();
      return tile;
    });

    expect(selfTile.querySelector('[data-testid="video-tile-placeholder"]')).not.toBeNull();
    expect(selfTile.querySelector('[data-testid="video-tile-mic-off"]')).not.toBeNull();
    expect(selfTile.querySelector('[data-testid="video-tile-mic-on"]')).toBeNull();
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
    const { getByRole, queryByTestId, signaling } = renderRoomScreen();
    await waitFor(() => expect(signaling.api.emit).toHaveBeenCalledWith('join', expect.any(Object)));

    act(() => {
      signaling.trigger('join:rejected', { code: 'room-full', message: 'Комната заполнена' });
    });

    await waitFor(() => expect(getByRole('alert').textContent).toContain('Похоже, комната уже занята'));
    expect(queryByTestId('room-top-bar')).toBeNull();
    expect(queryByTestId('video-grid')).toBeNull();
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

  describe('Задача 38 — гейт «Выйти» (критерий приёмки: клик больше НЕ эмитит leave напрямую)', () => {
    it('клик «Выйти» в шапке открывает гейт подтверждения и НЕ эмитит leave', async () => {
      const { getByTestId, queryByTestId, signaling } = renderRoomScreen();
      await waitFor(() => expect(signaling.api.emit).toHaveBeenCalledWith('join', expect.any(Object)));
      signaling.api.emit.mockClear();

      expect(queryByTestId('exit-confirm')).toBeNull();

      fireEvent.click(getByTestId('leave-button'));

      expect(getByTestId('exit-confirm')).toBeTruthy();
      expect(signaling.api.emit).not.toHaveBeenCalledWith('leave');
    });

    it('«Остаться» закрывает гейт без эмита leave', async () => {
      const { getByTestId, queryByTestId, signaling } = renderRoomScreen();
      await waitFor(() => expect(signaling.api.emit).toHaveBeenCalledWith('join', expect.any(Object)));

      fireEvent.click(getByTestId('leave-button'));
      signaling.api.emit.mockClear();
      fireEvent.click(getByTestId('exit-confirm-stay'));

      expect(queryByTestId('exit-confirm')).toBeNull();
      expect(signaling.api.emit).not.toHaveBeenCalledWith('leave');
    });

    it('подтверждение «Выйти» внутри гейта закрывает его и эмитит leave', async () => {
      const { getByTestId, queryByTestId, signaling } = renderRoomScreen();
      await waitFor(() => expect(signaling.api.emit).toHaveBeenCalledWith('join', expect.any(Object)));

      fireEvent.click(getByTestId('leave-button'));
      fireEvent.click(getByTestId('exit-confirm-leave'));

      expect(queryByTestId('exit-confirm')).toBeNull();
      // Design §7.3 `leave {}` — без payload; обёртка `emit` в RoomScreen всегда
      // форвардит второй аргумент, поэтому фактический вызов — `('leave', undefined)`.
      expect(signaling.api.emit).toHaveBeenCalledWith('leave', undefined);
    });

    it('баг-фикс задачи 42: подтверждение «Выйти» вызывает props.onLeave — иначе пользователь визуально остаётся на экране комнаты', async () => {
      const onLeave = vi.fn();
      const { getByTestId, signaling } = renderRoomScreen({ onLeave });
      await waitFor(() => expect(signaling.api.emit).toHaveBeenCalledWith('join', expect.any(Object)));

      fireEvent.click(getByTestId('leave-button'));
      expect(onLeave).not.toHaveBeenCalled();

      fireEvent.click(getByTestId('exit-confirm-leave'));

      expect(onLeave).toHaveBeenCalledTimes(1);
    });

    it('«Остаться» не вызывает props.onLeave', async () => {
      const onLeave = vi.fn();
      const { getByTestId, signaling } = renderRoomScreen({ onLeave });
      await waitFor(() => expect(signaling.api.emit).toHaveBeenCalledWith('join', expect.any(Object)));

      fireEvent.click(getByTestId('leave-button'));
      fireEvent.click(getByTestId('exit-confirm-stay'));

      expect(onLeave).not.toHaveBeenCalled();
    });
  });

  describe('Задача 41 — сворачиваемая панель Чат/Участники (addendum §5.4, критерий приёмки)', () => {
    it('по умолчанию панель закрыта, бейдж непрочитанных не рендерится', async () => {
      const { getByTestId, queryByTestId, signaling } = renderRoomScreen();
      await waitFor(() => expect(signaling.api.emit).toHaveBeenCalledWith('join', expect.any(Object)));

      expect(getByTestId('chat-side-panel').getAttribute('data-open')).toBe('false');
      expect(queryByTestId('chat-unread-badge')).toBeNull();
    });

    it('chat:message, пока панель закрыта, инкрементирует unreadCount (бейдж в RoomTopBar)', async () => {
      const { getByTestId, signaling } = renderRoomScreen();
      await waitFor(() => expect(signaling.api.emit).toHaveBeenCalledWith('join', expect.any(Object)));

      act(() => {
        signaling.trigger('join:ok', JOIN_OK_PAYLOAD);
      });

      act(() => {
        signaling.trigger('chat:message', { id: 'm2', authorId: 'peer-1', authorName: 'Боб', text: 'Привет', ts: 2 });
      });
      await waitFor(() => expect(getByTestId('chat-unread-badge').textContent).toBe('1'));

      act(() => {
        signaling.trigger('chat:message', { id: 'm3', authorId: 'peer-1', authorName: 'Боб', text: 'Ещё', ts: 3 });
      });
      await waitFor(() => expect(getByTestId('chat-unread-badge').textContent).toBe('2'));
    });

    it('chat:system (join/leave), пока панель закрыта, тоже инкрементирует unreadCount', async () => {
      const { getByTestId, signaling } = renderRoomScreen();
      await waitFor(() => expect(signaling.api.emit).toHaveBeenCalledWith('join', expect.any(Object)));

      act(() => {
        signaling.trigger('join:ok', JOIN_OK_PAYLOAD);
      });

      act(() => {
        signaling.trigger('chat:system', { id: 's1', event: 'join', subjectName: 'Вика', ts: 4 });
      });

      await waitFor(() => expect(getByTestId('chat-unread-badge').textContent).toBe('1'));
    });

    it('открытие панели кнопкой «Чат» сбрасывает unreadCount в 0', async () => {
      const { getByTestId, queryByTestId, signaling } = renderRoomScreen();
      await waitFor(() => expect(signaling.api.emit).toHaveBeenCalledWith('join', expect.any(Object)));

      act(() => {
        signaling.trigger('join:ok', JOIN_OK_PAYLOAD);
      });
      act(() => {
        signaling.trigger('chat:message', { id: 'm2', authorId: 'peer-1', authorName: 'Боб', text: 'Привет', ts: 2 });
      });
      await waitFor(() => expect(getByTestId('chat-unread-badge').textContent).toBe('1'));

      fireEvent.click(getByTestId('chat-toggle-button'));

      await waitFor(() => expect(queryByTestId('chat-unread-badge')).toBeNull());
      expect(getByTestId('chat-side-panel').getAttribute('data-open')).toBe('true');
      // Кнопка «Чат» открывает панель именно на вкладке «Чат» (README §5).
      expect(getByTestId('chat-side-panel-tab-chat').getAttribute('aria-selected')).toBe('true');
    });

    it('новое сообщение, пока панель открыта на вкладке «Чат», НЕ инкрементирует бейдж', async () => {
      const { getByTestId, queryByTestId, signaling } = renderRoomScreen();
      await waitFor(() => expect(signaling.api.emit).toHaveBeenCalledWith('join', expect.any(Object)));

      act(() => {
        signaling.trigger('join:ok', JOIN_OK_PAYLOAD);
      });
      fireEvent.click(getByTestId('chat-toggle-button'));
      expect(getByTestId('chat-side-panel-tab-chat').getAttribute('aria-selected')).toBe('true');

      act(() => {
        signaling.trigger('chat:message', { id: 'm2', authorId: 'peer-1', authorName: 'Боб', text: 'Привет', ts: 2 });
      });

      expect(queryByTestId('chat-unread-badge')).toBeNull();
    });

    it('переключение на вкладку «Участники» при открытой панели — новое сообщение снова инкрементирует бейдж; возврат на «Чат» сбрасывает его', async () => {
      const { getByTestId, queryByTestId, signaling } = renderRoomScreen();
      await waitFor(() => expect(signaling.api.emit).toHaveBeenCalledWith('join', expect.any(Object)));

      act(() => {
        signaling.trigger('join:ok', JOIN_OK_PAYLOAD);
      });
      fireEvent.click(getByTestId('chat-toggle-button'));
      fireEvent.click(getByTestId('chat-side-panel-tab-participants'));

      act(() => {
        signaling.trigger('chat:message', { id: 'm2', authorId: 'peer-1', authorName: 'Боб', text: 'Привет', ts: 2 });
      });
      await waitFor(() => expect(getByTestId('chat-unread-badge').textContent).toBe('1'));

      fireEvent.click(getByTestId('chat-side-panel-tab-chat'));

      await waitFor(() => expect(queryByTestId('chat-unread-badge')).toBeNull());
    });
  });

  describe('Задача 30 — баннеры ошибок и состояний (Design §8, F-33/F-35/F-36, US-5/US-12/US-13, SEC-15)', () => {
    it('join:rejected{room-full} → RoomFullBanner с кнопкой «Попробовать снова», повторный клик повторно эмитит join', async () => {
      const { getByTestId, getByRole, signaling } = renderRoomScreen();
      await waitFor(() => expect(signaling.api.emit).toHaveBeenCalledWith('join', expect.any(Object)));
      signaling.api.emit.mockClear();

      act(() => {
        signaling.trigger('join:rejected', { code: 'room-full', message: 'Комната заполнена.' });
      });

      const banner = getByTestId('room-full-banner');
      expect(banner.textContent).toContain('Похоже, комната уже занята');

      fireEvent.click(getByRole('button', { name: 'Попробовать снова' }));

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
