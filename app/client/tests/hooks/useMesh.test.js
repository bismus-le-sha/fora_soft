import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMesh } from '../../src/hooks/useMesh.js';

/**
 * Задача 24 — `useMesh` (Design §3.3/§4.2/§7.1, F-06/F-07, US-6/9).
 *
 * Проверяет: (1) `ensureMesh` создаёт mesh-инстанс ровно один раз (идемпотентно,
 * в т.ч. без повторного `iceServers`); (2) `emit` форвардится в фабрику;
 * (3) `getVideoSenders` — безопасный дефолт до создания mesh, делегирует после;
 * (4) `remoteStreams` обновляется по `onRemoteStream` callback-у;
 * (5) unmount вызывает `closeAll()`.
 */
function makeFakeMeshManager() {
  let remoteStreamCb = null;
  return {
    onParticipantJoined: vi.fn(),
    addExistingParticipant: vi.fn(),
    onParticipantLeft: vi.fn(),
    handleSignal: vi.fn(),
    attachLocalTrack: vi.fn(),
    getVideoSenders: vi.fn(() => ['sender-1']),
    getRemoteStream: vi.fn(() => null),
    getPeerIds: vi.fn(() => []),
    onRemoteStream: vi.fn((cb) => {
      remoteStreamCb = cb;
      return () => {
        remoteStreamCb = null;
      };
    }),
    closeAll: vi.fn(),
    _emitRemoteStream(id, stream) {
      remoteStreamCb?.(id, stream);
    },
  };
}

describe('useMesh (Design §3.3/§4.2/§7.1)', () => {
  it('до ensureMesh(): getVideoSenders() — безопасный дефолт []', () => {
    const { result } = renderHook(() => useMesh({ emit: vi.fn() }));
    expect(result.current.getVideoSenders()).toEqual([]);
  });

  it('ensureMesh() создаёт mesh ровно один раз, форвардит emit/iceServers в фабрику', () => {
    const emit = vi.fn();
    const fakeMesh = makeFakeMeshManager();
    const createMeshManager = vi.fn(() => fakeMesh);

    const { result } = renderHook(() => useMesh({ emit, deps: { createMeshManager } }));

    const iceServers = [{ urls: 'stun:example' }];
    let instance1;
    let instance2;
    act(() => {
      instance1 = result.current.ensureMesh(iceServers);
      instance2 = result.current.ensureMesh(); // повторный вызов без iceServers
    });

    expect(createMeshManager).toHaveBeenCalledTimes(1);
    expect(createMeshManager).toHaveBeenCalledWith({ emit, iceServers });
    expect(instance1).toBe(fakeMesh);
    expect(instance2).toBe(fakeMesh);
  });

  it('getVideoSenders() делегирует в mesh после создания', () => {
    const fakeMesh = makeFakeMeshManager();
    const createMeshManager = vi.fn(() => fakeMesh);
    const { result } = renderHook(() => useMesh({ emit: vi.fn(), deps: { createMeshManager } }));

    act(() => {
      result.current.ensureMesh([]);
    });

    expect(result.current.getVideoSenders()).toEqual(['sender-1']);
  });

  it('remoteStreams обновляется на onRemoteStream(id, stream) и удаляется при stream=null', () => {
    const fakeMesh = makeFakeMeshManager();
    const createMeshManager = vi.fn(() => fakeMesh);
    const { result } = renderHook(() => useMesh({ emit: vi.fn(), deps: { createMeshManager } }));

    act(() => {
      result.current.ensureMesh([]);
    });

    const stream = { id: 'stream-1' };
    act(() => {
      fakeMesh._emitRemoteStream('peer-1', stream);
    });
    expect(result.current.remoteStreams).toEqual({ 'peer-1': stream });

    act(() => {
      fakeMesh._emitRemoteStream('peer-1', null);
    });
    expect(result.current.remoteStreams).toEqual({});
  });

  it('unmount вызывает closeAll() на созданном mesh', () => {
    const fakeMesh = makeFakeMeshManager();
    const createMeshManager = vi.fn(() => fakeMesh);
    const { result, unmount } = renderHook(() => useMesh({ emit: vi.fn(), deps: { createMeshManager } }));

    act(() => {
      result.current.ensureMesh([]);
    });

    unmount();

    expect(fakeMesh.closeAll).toHaveBeenCalledTimes(1);
  });
});
