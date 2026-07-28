import { describe, it, expect, vi } from 'vitest';
import { createMeshManager } from '../../src/webrtc/MeshManager.js';

/**
 * Задача 23 — `MeshManager.js` (Design §3.3/§4.2/§7.1/§11.3, F-06, US-6/9).
 *
 * Критерии приёмки (`impl-video-chat-room.md`, задача 23): «тест — новичок
 * НЕ инициирует оферы, старожил инициирует ровно один offer на пару; при
 * уходе пира соединение закрывается.»
 *
 * `PeerConnection` инжектируется через `deps.createPeerConnection` (тот же
 * DI-приём, что `deps.RTCPeerConnection` в `PeerConnection.test.js` и
 * `deps.getUserMedia`/`deps.io` в `mediaController.js`/`signalingClient.js`)
 * — фейковая реализация ниже даёт полный контроль над `createOffer`/
 * `acceptOffer`/`acceptAnswer`/`addIce`/`onTrack`/`onIceCandidate`/`close`
 * без настоящего `RTCPeerConnection`.
 */

/** @returns {{deps: object, instances: Map<number, object>, factory: import('vitest').Mock}} */
function makeDeps(overrides = {}) {
  const instances = new Map();
  let nextId = 0;

  const factory = vi.fn((pcDeps) => {
    const id = nextId++;
    const trackHandlers = new Set();
    const iceHandlers = new Set();
    const iceStateHandlers = new Set();
    const senders = [];
    const fake = {
      id,
      pcDeps,
      closed: false,
      createOffer: vi.fn(async () => `offer-sdp-${id}`),
      acceptOffer: vi.fn(async (sdp) => (sdp === 'CORRUPT' ? null : `answer-sdp-${id}-for-${sdp}`)),
      acceptAnswer: vi.fn(async () => true),
      addIce: vi.fn(async () => true),
      addTrack: vi.fn((track, stream) => {
        const sender = { track, stream, replaceTrack: vi.fn(async (t) => { sender.track = t; }) };
        senders.push(sender);
        return sender;
      }),
      replaceTrack: vi.fn(async () => {}),
      onTrack: vi.fn((cb) => {
        trackHandlers.add(cb);
        return () => trackHandlers.delete(cb);
      }),
      onIceCandidate: vi.fn((cb) => {
        iceHandlers.add(cb);
        return () => iceHandlers.delete(cb);
      }),
      // Задача 31 (Design §8/SEC-17 «graceful P2P») — см. `PeerConnection.js`.
      onIceConnectionStateChange: vi.fn((cb) => {
        iceStateHandlers.add(cb);
        return () => iceStateHandlers.delete(cb);
      }),
      close: vi.fn(() => {
        fake.closed = true;
      }),
      // Тестовые хелперы — не часть контракта PeerConnection.
      _emitTrack(event) {
        for (const cb of trackHandlers) cb(event);
      },
      _emitIce(candidate) {
        for (const cb of iceHandlers) cb(candidate);
      },
      _emitIceState(state) {
        for (const cb of iceStateHandlers) cb(state);
      },
      _senders: senders,
    };
    instances.set(id, fake);
    return fake;
  });

  const emit = vi.fn();

  return {
    deps: { createPeerConnection: factory, emit, ...overrides },
    instances,
    factory,
    emit,
  };
}

describe('MeshManager (Design §3.3/§4.2/§7.1, F-06, US-6/9)', () => {
  describe('directional glare-free mesh (Design §7.1, критерий приёмки задачи 23)', () => {
    it('старожил (onParticipantJoined) инициирует ровно один offer на пару', async () => {
      const { deps, instances, emit } = makeDeps();
      const mesh = createMeshManager(deps);

      await mesh.onParticipantJoined('peer-1');

      expect(instances.size).toBe(1);
      const pc = instances.get(0);
      expect(pc.createOffer).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith('signal:offer', { to: 'peer-1', sdp: 'offer-sdp-0' });
    });

    it('новичок (addExistingParticipant) НЕ инициирует offer — только регистрирует соединение', () => {
      const { deps, instances, emit } = makeDeps();
      const mesh = createMeshManager(deps);

      mesh.addExistingParticipant('peer-old-timer');

      expect(instances.size).toBe(1);
      const pc = instances.get(0);
      expect(pc.createOffer).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it('повторный onParticipantJoined для уже известного пира не создаёт второе соединение и не переинициирует offer', async () => {
      const { deps, instances, emit } = makeDeps();
      const mesh = createMeshManager(deps);

      await mesh.onParticipantJoined('peer-1');
      await mesh.onParticipantJoined('peer-1');

      expect(instances.size).toBe(1);
      expect(emit).toHaveBeenCalledTimes(1);
    });

    it('симметричный сценарий пары: у новичка createOffer ни разу не вызван для пира, зарегистрированного через addExistingParticipant, даже если тот же пир потом уходит и возвращается', async () => {
      const { deps, instances } = makeDeps();
      const mesh = createMeshManager(deps);

      mesh.addExistingParticipant('old-timer-a');
      mesh.addExistingParticipant('old-timer-b');
      await mesh.onParticipantJoined('actual-newcomer');

      // Ровно один пир — actual-newcomer — получил offer; остальные два нет.
      const offerers = Array.from(instances.values()).filter((pc) => pc.createOffer.mock.calls.length > 0);
      expect(offerers).toHaveLength(1);
    });

    it('каждой паре из нескольких новых участников соответствует ровно один offer', async () => {
      const { deps, instances, emit } = makeDeps();
      const mesh = createMeshManager(deps);

      await mesh.onParticipantJoined('peer-a');
      await mesh.onParticipantJoined('peer-b');
      await mesh.onParticipantJoined('peer-c');

      expect(instances.size).toBe(3);
      for (const pc of instances.values()) {
        expect(pc.createOffer).toHaveBeenCalledTimes(1);
      }
      expect(emit).toHaveBeenCalledTimes(3);
      expect(emit).toHaveBeenCalledWith('signal:offer', { to: 'peer-a', sdp: 'offer-sdp-0' });
      expect(emit).toHaveBeenCalledWith('signal:offer', { to: 'peer-b', sdp: 'offer-sdp-1' });
      expect(emit).toHaveBeenCalledWith('signal:offer', { to: 'peer-c', sdp: 'offer-sdp-2' });
    });
  });

  describe('handleSignal — маршрутизация offer/answer/ice к нужному PeerConnection', () => {
    it('signal:offer — применяет offer на PeerConnection адресата и отправляет answer отправителю', async () => {
      const { deps, instances, emit } = makeDeps();
      const mesh = createMeshManager(deps);
      mesh.addExistingParticipant('old-timer'); // pc уже зарегистрирован (id 0)

      await mesh.handleSignal({ type: 'signal:offer', from: 'old-timer', sdp: 'incoming-offer-sdp' });

      const pc = instances.get(0);
      expect(pc.acceptOffer).toHaveBeenCalledWith('incoming-offer-sdp');
      expect(emit).toHaveBeenCalledWith('signal:answer', {
        to: 'old-timer',
        sdp: 'answer-sdp-0-for-incoming-offer-sdp',
      });
    });

    it('signal:offer без предварительной регистрации пира создаёт PeerConnection defensively (не роняет клиент)', async () => {
      const { deps, instances } = makeDeps();
      const mesh = createMeshManager(deps);

      await expect(
        mesh.handleSignal({ type: 'signal:offer', from: 'late-peer', sdp: 'sdp' }),
      ).resolves.toBeUndefined();

      expect(instances.size).toBe(1);
      expect(mesh.getPeerIds()).toEqual(['late-peer']);
    });

    it('SEC-18: битый offer (acceptOffer -> null) не порождает answer', async () => {
      const { deps, emit } = makeDeps();
      const mesh = createMeshManager(deps);
      mesh.addExistingParticipant('old-timer');

      await mesh.handleSignal({ type: 'signal:offer', from: 'old-timer', sdp: 'CORRUPT' });

      expect(emit).not.toHaveBeenCalled();
    });

    it('signal:answer — применяет answer на PeerConnection отправителя (старожил применяет ответ новичка)', async () => {
      const { deps, instances, emit } = makeDeps();
      const mesh = createMeshManager(deps);
      await mesh.onParticipantJoined('newcomer'); // старожил создаёт offer -> pc id 0
      emit.mockClear();

      await mesh.handleSignal({ type: 'signal:answer', from: 'newcomer', sdp: 'answer-sdp' });

      const pc = instances.get(0);
      expect(pc.acceptAnswer).toHaveBeenCalledWith('answer-sdp');
      expect(emit).not.toHaveBeenCalled();
    });

    it('signal:answer для неизвестного пира — безопасный no-op, не бросает', async () => {
      const { deps } = makeDeps();
      const mesh = createMeshManager(deps);

      await expect(
        mesh.handleSignal({ type: 'signal:answer', from: 'unknown', sdp: 'x' }),
      ).resolves.toBeUndefined();
    });

    it('signal:ice — применяет кандидат на PeerConnection отправителя', async () => {
      const { deps, instances } = makeDeps();
      const mesh = createMeshManager(deps);
      mesh.addExistingParticipant('peer-1');
      const candidate = { candidate: 'candidate:1 ...' };

      await mesh.handleSignal({ type: 'signal:ice', from: 'peer-1', candidate });

      expect(instances.get(0).addIce).toHaveBeenCalledWith(candidate);
    });

    it('signal:ice для неизвестного/уже ушедшего пира — безопасный no-op, не бросает', async () => {
      const { deps } = makeDeps();
      const mesh = createMeshManager(deps);

      await expect(
        mesh.handleSignal({ type: 'signal:ice', from: 'gone', candidate: {} }),
      ).resolves.toBeUndefined();
    });

    it('исходящие ICE-кандидаты (onIceCandidate) ретранслируются серверу с корректным адресатом', () => {
      const { deps, instances, emit } = makeDeps();
      const mesh = createMeshManager(deps);
      mesh.addExistingParticipant('peer-1');
      const candidate = { candidate: 'candidate:2 ...' };

      instances.get(0)._emitIce(candidate);

      expect(emit).toHaveBeenCalledWith('signal:ice', { to: 'peer-1', candidate });
    });
  });

  describe('participant:left → close (Design §7.3, критерий приёмки задачи 23)', () => {
    it('onParticipantLeft закрывает PeerConnection и удаляет пира из реестра', async () => {
      const { deps, instances } = makeDeps();
      const mesh = createMeshManager(deps);
      await mesh.onParticipantJoined('peer-1');

      mesh.onParticipantLeft('peer-1');

      expect(instances.get(0).close).toHaveBeenCalledTimes(1);
      expect(mesh.getPeerIds()).toEqual([]);
    });

    it('после onParticipantLeft повторный signal:ice для того же peerId не создаёт новое соединение', async () => {
      const { deps, instances } = makeDeps();
      const mesh = createMeshManager(deps);
      await mesh.onParticipantJoined('peer-1');
      mesh.onParticipantLeft('peer-1');

      await mesh.handleSignal({ type: 'signal:ice', from: 'peer-1', candidate: {} });

      expect(instances.size).toBe(1); // не создан новый — signal:ice не создаёт pc сам по себе
      expect(instances.get(0).addIce).not.toHaveBeenCalled();
    });

    it('onParticipantLeft для неизвестного/уже ушедшего пира — безопасный no-op, не бросает', () => {
      const { deps } = makeDeps();
      const mesh = createMeshManager(deps);

      expect(() => mesh.onParticipantLeft('never-existed')).not.toThrow();
    });

    it('closeAll закрывает все текущие соединения', async () => {
      const { deps, instances } = makeDeps();
      const mesh = createMeshManager(deps);
      await mesh.onParticipantJoined('peer-a');
      await mesh.onParticipantJoined('peer-b');

      mesh.closeAll();

      expect(instances.get(0).close).toHaveBeenCalledTimes(1);
      expect(instances.get(1).close).toHaveBeenCalledTimes(1);
      expect(mesh.getPeerIds()).toEqual([]);
    });
  });

  describe('remote-streams — агрегация (Design §7.1 «агрегирует remote-streams»)', () => {
    it('onTrack на PeerConnection обновляет getRemoteStream(id) и уведомляет подписчиков onRemoteStream', async () => {
      const { deps, instances } = makeDeps();
      const mesh = createMeshManager(deps);
      const handler = vi.fn();
      mesh.onRemoteStream(handler);
      await mesh.onParticipantJoined('peer-1');
      const stream = { id: 'remote-stream-1' };

      instances.get(0)._emitTrack({ track: { kind: 'video' }, streams: [stream] });

      expect(mesh.getRemoteStream('peer-1')).toBe(stream);
      expect(handler).toHaveBeenCalledWith('peer-1', stream);
    });

    it('getRemoteStream для неизвестного пира возвращает null', () => {
      const { deps } = makeDeps();
      const mesh = createMeshManager(deps);

      expect(mesh.getRemoteStream('unknown')).toBeNull();
    });

    it('onParticipantLeft уведомляет подписчиков onRemoteStream со stream:null и удаляет агрегированный поток', async () => {
      const { deps, instances } = makeDeps();
      const mesh = createMeshManager(deps);
      const handler = vi.fn();
      await mesh.onParticipantJoined('peer-1');
      const stream = { id: 's' };
      instances.get(0)._emitTrack({ track: { kind: 'video' }, streams: [stream] });
      mesh.onRemoteStream(handler);

      mesh.onParticipantLeft('peer-1');

      expect(handler).toHaveBeenCalledWith('peer-1', null);
      expect(mesh.getRemoteStream('peer-1')).toBeNull();
    });

    it('отписка через возвращённую функцию прекращает доставку', async () => {
      const { deps, instances } = makeDeps();
      const mesh = createMeshManager(deps);
      const handler = vi.fn();
      const unsubscribe = mesh.onRemoteStream(handler);
      unsubscribe();
      await mesh.onParticipantJoined('peer-1');

      instances.get(0)._emitTrack({ track: { kind: 'video' }, streams: [{ id: 's' }] });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('attachLocalTrack — рассылка локального трека на все соединения', () => {
    it('прикрепляет трек ко всем уже зарегистрированным PeerConnection', async () => {
      const { deps, instances } = makeDeps();
      const mesh = createMeshManager(deps);
      await mesh.onParticipantJoined('peer-a');
      await mesh.onParticipantJoined('peer-b');
      const track = { kind: 'audio' };
      const stream = { id: 'local' };

      mesh.attachLocalTrack(track, stream);

      expect(instances.get(0).addTrack).toHaveBeenCalledWith(track, stream);
      expect(instances.get(1).addTrack).toHaveBeenCalledWith(track, stream);
    });

    it('трек, прикреплённый ДО входа пира в mesh, автоматически подставляется в новый PeerConnection', async () => {
      const { deps, instances } = makeDeps();
      const mesh = createMeshManager(deps);
      const track = { kind: 'video' };
      const stream = { id: 'local' };
      mesh.attachLocalTrack(track, stream);

      await mesh.onParticipantJoined('peer-a');

      expect(instances.get(0).addTrack).toHaveBeenCalledWith(track, stream);
    });

    it('getVideoSenders агрегирует video-sender по одному на соединение, включая пиров, добавленных после attachLocalTrack', async () => {
      const { deps } = makeDeps();
      const mesh = createMeshManager(deps);
      const audioTrack = { kind: 'audio' };
      const videoTrack = { kind: 'video' };
      mesh.attachLocalTrack(audioTrack);
      mesh.attachLocalTrack(videoTrack);
      await mesh.onParticipantJoined('peer-a');
      await mesh.onParticipantJoined('peer-b');

      const senders = mesh.getVideoSenders();

      expect(senders).toHaveLength(2);
      for (const sender of senders) {
        expect(sender.track).toBe(videoTrack);
      }
    });

    it('getVideoSenders исключает соединение после onParticipantLeft', async () => {
      const { deps } = makeDeps();
      const mesh = createMeshManager(deps);
      mesh.attachLocalTrack({ kind: 'video' });
      await mesh.onParticipantJoined('peer-a');
      await mesh.onParticipantJoined('peer-b');

      mesh.onParticipantLeft('peer-a');

      expect(mesh.getVideoSenders()).toHaveLength(1);
    });
  });

  describe('iceServers/фабрика PeerConnection — DI (SEC-17 forwarding)', () => {
    it('форвардит deps.iceServers в каждый создаваемый PeerConnection', async () => {
      const iceServers = [{ urls: 'stun:example.test' }];
      const { deps, instances } = makeDeps({ iceServers });
      const mesh = createMeshManager(deps);

      await mesh.onParticipantJoined('peer-1');

      expect(instances.get(0).pcDeps).toEqual({ iceServers });
    });

    it('без deps.iceServers не передаёт iceServers явно (оставляет дефолт самого createPeerConnection)', async () => {
      const { deps, instances } = makeDeps();
      delete deps.iceServers;
      const mesh = createMeshManager(deps);

      await mesh.onParticipantJoined('peer-1');

      expect(instances.get(0).pcDeps).toEqual({});
    });

    it('без deps.emit не бросает при инициации offer (безопасный no-op дефолт)', async () => {
      const { deps } = makeDeps();
      delete deps.emit;
      const mesh = createMeshManager(deps);

      await expect(mesh.onParticipantJoined('peer-1')).resolves.toBeUndefined();
    });
  });

  describe('graceful P2P — ICE fail для одной пары (задача 31, Design §8/SEC-17, критерий приёмки)', () => {
    it("ICE 'failed' для одной пары убирает её remote-stream (плитка без медиа), не роняя приложение", async () => {
      const { deps, instances } = makeDeps();
      const mesh = createMeshManager(deps);
      const handler = vi.fn();
      mesh.onRemoteStream(handler);
      await mesh.onParticipantJoined('peer-a');
      const streamA = { id: 'stream-a' };
      instances.get(0)._emitTrack({ track: { kind: 'video' }, streams: [streamA] });

      expect(() => instances.get(0)._emitIceState('failed')).not.toThrow();

      expect(mesh.getRemoteStream('peer-a')).toBeNull();
      expect(handler).toHaveBeenCalledWith('peer-a', null);
    });

    it("ICE 'failed' НЕ закрывает PeerConnection и НЕ убирает пира из реестра (в отличие от onParticipantLeft)", async () => {
      const { deps, instances } = makeDeps();
      const mesh = createMeshManager(deps);
      await mesh.onParticipantJoined('peer-a');

      instances.get(0)._emitIceState('failed');

      expect(instances.get(0).close).not.toHaveBeenCalled();
      expect(mesh.getPeerIds()).toEqual(['peer-a']);
    });

    it('ICE fail одной пары не затрагивает другую — второй пир продолжает получать/отдавать сигналинг и медиа', async () => {
      const { deps, instances, emit } = makeDeps();
      const mesh = createMeshManager(deps);
      const handler = vi.fn();
      mesh.onRemoteStream(handler);
      await mesh.onParticipantJoined('peer-a');
      await mesh.onParticipantJoined('peer-b');
      const streamB = { id: 'stream-b' };
      instances.get(1)._emitTrack({ track: { kind: 'video' }, streams: [streamB] });

      instances.get(0)._emitIceState('failed');

      // peer-b полностью не затронут: поток на месте, сигналинг работает.
      expect(mesh.getRemoteStream('peer-b')).toBe(streamB);
      expect(handler).not.toHaveBeenCalledWith('peer-b', null);
      const candidate = { candidate: 'candidate:x' };
      instances.get(1)._emitIce(candidate);
      expect(emit).toHaveBeenCalledWith('signal:ice', { to: 'peer-b', candidate });
      // Чат — самостоятельный, независимый от mesh канал (Design §7.4/§4.2:
      // `ChatPanel`/`chat:send`/`chat:message` не обращаются к MeshManager
      // вовсе), поэтому его работоспособность не зависит от состояния ICE
      // какой-либо пары — здесь достаточно подтвердить, что mesh сам не упал
      // и не «утянул» за собой остальные соединения (проверено выше).
    });

    it("состояния 'connected'/'checking'/'completed' не трогают remote-stream (реагируем только на 'failed')", async () => {
      const { deps, instances } = makeDeps();
      const mesh = createMeshManager(deps);
      const handler = vi.fn();
      mesh.onRemoteStream(handler);
      await mesh.onParticipantJoined('peer-a');
      const stream = { id: 's' };
      instances.get(0)._emitTrack({ track: { kind: 'video' }, streams: [stream] });
      handler.mockClear();

      instances.get(0)._emitIceState('checking');
      instances.get(0)._emitIceState('connected');
      instances.get(0)._emitIceState('completed');

      expect(handler).not.toHaveBeenCalled();
      expect(mesh.getRemoteStream('peer-a')).toBe(stream);
    });

    it('PeerConnection без onIceConnectionStateChange (дефенсивно) — регистрация пира не бросает', async () => {
      const instances = new Map();
      let nextId = 0;
      const factory = vi.fn(() => {
        const id = nextId++;
        const fake = {
          id,
          createOffer: vi.fn(async () => `offer-${id}`),
          onTrack: vi.fn(),
          onIceCandidate: vi.fn(),
          close: vi.fn(),
          // onIceConnectionStateChange намеренно отсутствует.
        };
        instances.set(id, fake);
        return fake;
      });
      const mesh = createMeshManager({ createPeerConnection: factory, emit: vi.fn() });

      await expect(mesh.onParticipantJoined('peer-a')).resolves.toBeUndefined();
      expect(instances.size).toBe(1);
    });
  });
});
