import { useCallback, useEffect, useRef, useState } from 'react';
import { createMeshManager } from '../webrtc/MeshManager.js';

/**
 * useMesh.js — React-хук-обёртка над `MeshManager.js` (задача 24).
 *
 * Design §4.2: «`RoomScreen.jsx` | Оркестрация: media → mesh → signaling».
 * Интегрируется с `useSignaling` через `emit` (исходящие `signal:offer/
 * answer/ice` — Design §6.1) — входящие `signal:*` от сигналинга
 * маршрутизируются в `meshManager.handleSignal(...)` вызывающей стороной
 * (`RoomScreen`), а не этим хуком напрямую: обработчики входящих событий уже
 * централизованы в `handlers`, передаваемых в `useSignaling`.
 *
 * Design §7.1 (правило инициативы): реальный `MeshManager` создаётся не
 * раньше, чем известен `join:ok.iceServers` (SEC-17 — серверный список
 * приоритетнее статического fallback `config.ICE_SERVERS`, см. JSDoc
 * `config.js`). До этого момента `MeshManager` использовать не с чем — на
 * практике первый вызов mesh-методов (`addExistingParticipant`) происходит
 * именно в обработчике `join:ok`, поэтому создание — ленивое, через
 * `ensureMesh(iceServers)`.
 *
 * Requirements: F-06, F-07, US-6, US-9. Design: §3.3, §4.2, §7.1.
 */

/**
 * @param {object} [options]
 * @param {(event: string, payload?: object) => void} [options.emit] —
 *   форвардится в `createMeshManager({ emit })` как `deps.emit` (исходящие
 *   `signal:offer/answer/ice`); в рантайме — `useSignaling().emit`.
 * @param {object} [options.deps]
 * @param {(deps?: object) => ReturnType<typeof createMeshManager>} [options.deps.createMeshManager]
 *   — фабрика mesh-менеджера, по умолчанию реальный `createMeshManager`;
 *   параметр только для тестируемости (тот же DI-приём, что в `MeshManager.test.js`).
 * @returns {{
 *   ensureMesh: (iceServers?: RTCIceServer[]) => ReturnType<typeof createMeshManager>,
 *   getVideoSenders: () => RTCRtpSender[],
 *   remoteStreams: Record<string, MediaStream>,
 * }}
 */
export function useMesh({ emit, deps } = {}) {
  /** @type {import('react').MutableRefObject<ReturnType<typeof createMeshManager> | null>} */
  const meshRef = useRef(null);
  const [remoteStreams, setRemoteStreams] = useState({});

  /**
   * Идемпотентно создаёт (при первом вызове) и возвращает единственный
   * экземпляр `MeshManager` этого захода в комнату. Повторные вызовы (в т.ч.
   * без аргумента `iceServers`) возвращают уже существующий инстанс — так
   * `RoomScreen` может звать `ensureMesh()` без параметра из любого более
   * позднего обработчика (`participant:joined/left`, `signal:*`), не
   * заботясь о повторной инициализации.
   *
   * @param {RTCIceServer[]} [iceServers]
   * @returns {ReturnType<typeof createMeshManager>}
   */
  const ensureMesh = useCallback(
    (iceServers) => {
      if (meshRef.current) {
        return meshRef.current;
      }

      const createMesh = deps?.createMeshManager ?? createMeshManager;
      const mesh = createMesh({ emit, iceServers });

      mesh.onRemoteStream((id, stream) => {
        setRemoteStreams((prev) => {
          if (stream === null) {
            if (!(id in prev)) {
              return prev;
            }
            const next = { ...prev };
            delete next[id];
            return next;
          }
          return { ...prev, [id]: stream };
        });
      });

      meshRef.current = mesh;
      return mesh;
    },
    // meshRef/emit/deps стабильны на весь жизненный цикл RoomScreen (emit —
    // стабильная ссылка из useSignaling, deps — DI-объект, передаётся один
    // раз при монтировании).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /** Design §7.3: выход self из комнаты закрывает все PeerConnection. */
  useEffect(
    () => () => {
      meshRef.current?.closeAll();
    },
    [],
  );

  /**
   * Точка расширения для `mediaController.toggleVideo()` (см. JSDoc
   * `mediaController.js`/`MeshManager.js`) — стабильная ссылка независимо от
   * того, создан ли уже mesh-инстанс (до `join:ok` возвращает пустой список,
   * это безопасный дефолт).
   *
   * @returns {RTCRtpSender[]}
   */
  const getVideoSenders = useCallback(() => meshRef.current?.getVideoSenders() ?? [], []);

  return { ensureMesh, getVideoSenders, remoteStreams };
}
