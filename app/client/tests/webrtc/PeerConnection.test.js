import { describe, it, expect, vi } from 'vitest';
import { createPeerConnection } from '../../src/webrtc/PeerConnection.js';

/**
 * Задача 22 — `PeerConnection.js` (Design §4.2/§6.1/§6.2/§7.1/§8, F-06, US-6,
 * SEC-18).
 *
 * Критерии приёмки (`impl-video-chat-room.md`, задача 22): «юнит-тест —
 * битый SDP/ICE перехватывается; своего парсинга SDP нет».
 *
 * Нативный `RTCPeerConnection` инжектируется через `deps` (тот же DI-приём,
 * что `deps.getUserMedia`/`deps.io` в mediaController.js/signalingClient.js)
 * — фейковый класс ниже реализует минимальный набор методов реального
 * WebRTC API, достаточный для проверки поведения обёртки без jsdom-полифилов.
 */

const CORRUPT_SDP = 'CORRUPT-SDP-NOT-A-REAL-OFFER';
const CORRUPT_CANDIDATE = { candidate: 'CORRUPT-ICE-NOT-A-REAL-CANDIDATE' };

/** Фейковый RTCSessionDescription — держит только type/sdp, как настоящий. */
function fakeDescription(type, sdp) {
  return { type, sdp };
}

class FakeRTCPeerConnection {
  constructor(config) {
    this.config = config;
    this.localDescription = null;
    this.remoteDescription = null;
    this.ontrack = null;
    this.onicecandidate = null;
    this.oniceconnectionstatechange = null;
    this.iceConnectionState = 'new';
    this.closed = false;
    this._senders = [];
    this._appliedIce = [];
  }

  async createOffer() {
    return fakeDescription('offer', 'v=0\r\no=offer-sdp-body');
  }

  async createAnswer() {
    return fakeDescription('answer', 'v=0\r\no=answer-sdp-body');
  }

  async setLocalDescription(desc) {
    this.localDescription = desc;
  }

  async setRemoteDescription(desc) {
    if (desc.sdp === CORRUPT_SDP) {
      throw new Error('Failed to parse SessionDescription');
    }
    this.remoteDescription = desc;
  }

  async addIceCandidate(candidate) {
    if (candidate && candidate.candidate === CORRUPT_CANDIDATE.candidate) {
      throw new Error('Error processing ICE candidate');
    }
    this._appliedIce.push(candidate);
  }

  addTrack(track, stream) {
    const sender = {
      track,
      stream,
      replaceTrack: vi.fn(async (newTrack) => {
        sender.track = newTrack;
      }),
    };
    this._senders.push(sender);
    return sender;
  }

  getSenders() {
    return this._senders;
  }

  close() {
    this.closed = true;
  }
}

/** @returns {{deps: object, pcRef: {current: FakeRTCPeerConnection | null}}} */
function makeDeps() {
  const pcRef = { current: null };
  const RTCPeerConnection = vi.fn(function (config) {
    const instance = new FakeRTCPeerConnection(config);
    pcRef.current = instance;
    return instance;
  });
  return { deps: { RTCPeerConnection, iceServers: [{ urls: 'stun:example.test' }] }, pcRef };
}

describe('PeerConnection (Design §4.2/§7.1, F-06/US-6, SEC-18)', () => {
  it('конструирует нативный RTCPeerConnection с переданными iceServers (не хардкод)', () => {
    const { deps, pcRef } = makeDeps();
    createPeerConnection(deps);

    expect(deps.RTCPeerConnection).toHaveBeenCalledWith({ iceServers: deps.iceServers });
    expect(pcRef.current).not.toBeNull();
  });

  it('без deps.iceServers использует config.ICE_SERVERS по умолчанию (SEC-17 fallback)', async () => {
    const RTCPeerConnection = vi.fn(function (config) {
      return new FakeRTCPeerConnection(config);
    });
    const { ICE_SERVERS } = await import('../../src/config.js');

    createPeerConnection({ RTCPeerConnection });

    expect(RTCPeerConnection).toHaveBeenCalledWith({ iceServers: ICE_SERVERS });
  });

  describe('createOffer()', () => {
    it('создаёт offer, выставляет localDescription и возвращает SDP как есть (без парсинга)', async () => {
      const { deps, pcRef } = makeDeps();
      const pc = createPeerConnection(deps);

      const sdp = await pc.createOffer();

      expect(pcRef.current.localDescription).toEqual({ type: 'offer', sdp: 'v=0\r\no=offer-sdp-body' });
      expect(sdp).toBe('v=0\r\no=offer-sdp-body');
      expect(typeof sdp).toBe('string');
    });
  });

  describe('acceptOffer(sdp) — «новичок» отвечает на входящий offer', () => {
    it('happy-path: применяет offer как есть и возвращает SDP ответа', async () => {
      const { deps, pcRef } = makeDeps();
      const pc = createPeerConnection(deps);
      const incomingSdp = 'v=0\r\no=incoming-offer-from-peer';

      const answerSdp = await pc.acceptOffer(incomingSdp);

      expect(pcRef.current.remoteDescription).toEqual({ type: 'offer', sdp: incomingSdp });
      expect(answerSdp).toBe('v=0\r\no=answer-sdp-body');
    });

    it('SEC-18: битый offer-SDP перехватывается — не бросает, возвращает null, клиент жив', async () => {
      const { deps, pcRef } = makeDeps();
      const pc = createPeerConnection(deps);

      await expect(pc.acceptOffer(CORRUPT_SDP)).resolves.toBeNull();
      // remoteDescription не применилась — setRemoteDescription упал до присвоения.
      expect(pcRef.current.remoteDescription).toBeNull();
      // createAnswer/setLocalDescription не должны были вызываться после ошибки.
      expect(pcRef.current.localDescription).toBeNull();
    });

    it('передаёт SDP-строку нативному API дословно — своего парсинга SDP нет', async () => {
      const { deps, pcRef } = makeDeps();
      const pc = createPeerConnection(deps);
      const setRemoteSpy = vi.spyOn(pcRef.current, 'setRemoteDescription');
      const weirdButOpaqueSdp = 'v=0\r\nMALFORMED-BUT-NOT-THE-SENTINEL***???';

      await pc.acceptOffer(weirdButOpaqueSdp);

      expect(setRemoteSpy).toHaveBeenCalledWith({ type: 'offer', sdp: weirdButOpaqueSdp });
    });
  });

  describe('acceptAnswer(sdp) — «старожил» применяет входящий answer', () => {
    it('happy-path: применяет answer, возвращает true', async () => {
      const { deps, pcRef } = makeDeps();
      const pc = createPeerConnection(deps);
      const incomingSdp = 'v=0\r\no=incoming-answer-from-peer';

      const ok = await pc.acceptAnswer(incomingSdp);

      expect(ok).toBe(true);
      expect(pcRef.current.remoteDescription).toEqual({ type: 'answer', sdp: incomingSdp });
    });

    it('SEC-18: битый answer-SDP перехватывается — не бросает, возвращает false', async () => {
      const { deps, pcRef } = makeDeps();
      const pc = createPeerConnection(deps);

      await expect(pc.acceptAnswer(CORRUPT_SDP)).resolves.toBe(false);
      expect(pcRef.current.remoteDescription).toBeNull();
    });
  });

  describe('addIce(candidate) — SEC-18/Design §6.1 signal:ice{candidate: object}', () => {
    it('happy-path: применяет корректный ICE-кандидат как есть, возвращает true', async () => {
      const { deps, pcRef } = makeDeps();
      const pc = createPeerConnection(deps);
      const candidate = { candidate: 'candidate:1 1 UDP 2122252543 10.0.0.1 54321 typ host', sdpMid: '0', sdpMLineIndex: 0 };

      const ok = await pc.addIce(candidate);

      expect(ok).toBe(true);
      expect(pcRef.current._appliedIce).toEqual([candidate]);
    });

    it('SEC-18: битый/вредоносный ICE-кандидат перехватывается — не бросает, возвращает false', async () => {
      const { deps } = makeDeps();
      const pc = createPeerConnection(deps);

      await expect(pc.addIce(CORRUPT_CANDIDATE)).resolves.toBe(false);
    });

    it('не парсит поля кандидата — передаёт объект нативному addIceCandidate дословно', async () => {
      const { deps, pcRef } = makeDeps();
      const pc = createPeerConnection(deps);
      const addIceSpy = vi.spyOn(pcRef.current, 'addIceCandidate');
      const candidate = { candidate: 'candidate:2 1 UDP 1 10.0.0.2 1 typ srflx', sdpMid: '1', sdpMLineIndex: 1, extraField: 'passthrough' };

      await pc.addIce(candidate);

      expect(addIceSpy).toHaveBeenCalledWith(candidate);
    });
  });

  describe('addTrack() / replaceTrack() — Design §3.3 п.2/§7.2 (без renegotiation)', () => {
    it('addTrack прикрепляет дорожку к нативному pc и возвращает sender', () => {
      const { deps, pcRef } = makeDeps();
      const pc = createPeerConnection(deps);
      const track = { kind: 'video' };

      const sender = pc.addTrack(track);

      expect(pcRef.current._senders).toContain(sender);
      expect(sender.track).toBe(track);
    });

    it('replaceTrack(null) вызывает replaceTrack(null) на видео-sender этого соединения (release, F-19)', async () => {
      const { deps } = makeDeps();
      const pc = createPeerConnection(deps);
      const videoTrack = { kind: 'video' };
      pc.addTrack({ kind: 'audio' });
      const videoSender = pc.addTrack(videoTrack);

      await pc.replaceTrack(null);

      expect(videoSender.replaceTrack).toHaveBeenCalledWith(null);
    });

    it('replaceTrack(newTrack) вызывает replaceTrack на том же sender при повторном включении', async () => {
      const { deps } = makeDeps();
      const pc = createPeerConnection(deps);
      const videoSender = pc.addTrack({ kind: 'video' });
      const newTrack = { kind: 'video', id: 'new' };

      await pc.replaceTrack(null);
      await pc.replaceTrack(newTrack);

      expect(videoSender.replaceTrack).toHaveBeenNthCalledWith(1, null);
      expect(videoSender.replaceTrack).toHaveBeenNthCalledWith(2, newTrack);
    });

    it('replaceTrack(track) без предшествующего addTrack — добавляет новый sender (edge case), не бросает', async () => {
      const { deps, pcRef } = makeDeps();
      const pc = createPeerConnection(deps);
      const track = { kind: 'video' };

      await expect(pc.replaceTrack(track)).resolves.toBeUndefined();

      expect(pcRef.current._senders).toHaveLength(1);
      expect(pcRef.current._senders[0].track).toBe(track);
    });

    it('replaceTrack(null) без единого sender — безопасный no-op, не бросает', async () => {
      const { deps } = makeDeps();
      const pc = createPeerConnection(deps);

      await expect(pc.replaceTrack(null)).resolves.toBeUndefined();
    });
  });

  describe('onTrack(cb) — Design §7.1 «агрегирует remote-streams»', () => {
    it('вызывает подписчика на нативное pc.ontrack', () => {
      const { deps, pcRef } = makeDeps();
      const pc = createPeerConnection(deps);
      const handler = vi.fn();
      pc.onTrack(handler);
      const event = { track: { kind: 'video' }, streams: [] };

      pcRef.current.ontrack(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('отписка через возвращённую функцию прекращает доставку', () => {
      const { deps, pcRef } = makeDeps();
      const pc = createPeerConnection(deps);
      const handler = vi.fn();
      const unsubscribe = pc.onTrack(handler);
      unsubscribe();

      pcRef.current.ontrack({ track: {}, streams: [] });

      expect(handler).not.toHaveBeenCalled();
    });

    it('падение одного подписчика не блокирует доставку остальным', () => {
      const { deps, pcRef } = makeDeps();
      const pc = createPeerConnection(deps);
      const broken = vi.fn(() => {
        throw new Error('boom');
      });
      const healthy = vi.fn();
      pc.onTrack(broken);
      pc.onTrack(healthy);

      expect(() => pcRef.current.ontrack({ track: {}, streams: [] })).not.toThrow();
      expect(healthy).toHaveBeenCalledTimes(1);
    });
  });

  describe('onIceCandidate(cb) — Design §7.1 «par ICE trickle»', () => {
    it('вызывает подписчика на нативное pc.onicecandidate с непустым кандидатом', () => {
      const { deps, pcRef } = makeDeps();
      const pc = createPeerConnection(deps);
      const handler = vi.fn();
      pc.onIceCandidate(handler);
      const candidate = { candidate: 'candidate:1 ...' };

      pcRef.current.onicecandidate({ candidate });

      expect(handler).toHaveBeenCalledWith(candidate);
    });

    it('маркер конца сбора кандидатов (candidate: null) не пробрасывается подписчикам', () => {
      const { deps, pcRef } = makeDeps();
      const pc = createPeerConnection(deps);
      const handler = vi.fn();
      pc.onIceCandidate(handler);

      pcRef.current.onicecandidate({ candidate: null });

      expect(handler).not.toHaveBeenCalled();
    });

    it('отписка через возвращённую функцию прекращает доставку', () => {
      const { deps, pcRef } = makeDeps();
      const pc = createPeerConnection(deps);
      const handler = vi.fn();
      const unsubscribe = pc.onIceCandidate(handler);
      unsubscribe();

      pcRef.current.onicecandidate({ candidate: { candidate: 'x' } });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('close()', () => {
    it('закрывает нативное соединение', () => {
      const { deps, pcRef } = makeDeps();
      const pc = createPeerConnection(deps);

      pc.close();

      expect(pcRef.current.closed).toBe(true);
    });
  });

  describe('onIceConnectionStateChange(cb) — задача 31 (Design §8/SEC-17 «graceful P2P»)', () => {
    it('вызывает подписчика на нативное pc.oniceconnectionstatechange с текущим iceConnectionState', () => {
      const { deps, pcRef } = makeDeps();
      const pc = createPeerConnection(deps);
      const handler = vi.fn();
      pc.onIceConnectionStateChange(handler);
      pcRef.current.iceConnectionState = 'failed';

      pcRef.current.oniceconnectionstatechange();

      expect(handler).toHaveBeenCalledWith('failed');
    });

    it('доставляет несколько последовательных изменений состояния', () => {
      const { deps, pcRef } = makeDeps();
      const pc = createPeerConnection(deps);
      const handler = vi.fn();
      pc.onIceConnectionStateChange(handler);

      pcRef.current.iceConnectionState = 'checking';
      pcRef.current.oniceconnectionstatechange();
      pcRef.current.iceConnectionState = 'connected';
      pcRef.current.oniceconnectionstatechange();

      expect(handler).toHaveBeenNthCalledWith(1, 'checking');
      expect(handler).toHaveBeenNthCalledWith(2, 'connected');
    });

    it('отписка через возвращённую функцию прекращает доставку', () => {
      const { deps, pcRef } = makeDeps();
      const pc = createPeerConnection(deps);
      const handler = vi.fn();
      const unsubscribe = pc.onIceConnectionStateChange(handler);
      unsubscribe();
      pcRef.current.iceConnectionState = 'failed';

      pcRef.current.oniceconnectionstatechange();

      expect(handler).not.toHaveBeenCalled();
    });

    it('падение одного подписчика не блокирует доставку остальным (не роняет клиент, SEC-17)', () => {
      const { deps, pcRef } = makeDeps();
      const pc = createPeerConnection(deps);
      const broken = vi.fn(() => {
        throw new Error('boom');
      });
      const healthy = vi.fn();
      pc.onIceConnectionStateChange(broken);
      pc.onIceConnectionStateChange(healthy);
      pcRef.current.iceConnectionState = 'failed';

      expect(() => pcRef.current.oniceconnectionstatechange()).not.toThrow();
      expect(healthy).toHaveBeenCalledTimes(1);
    });
  });
});
