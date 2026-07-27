/**
 * MeshManager.js — реестр `PeerConnection` по peerId и directional
 * glare-free mesh (задача 23).
 *
 * Design §4.2 (таблица компонентов): «Реестр `PeerConnection` по peerId;
 * создаёт/закрывает соединения по событиям состава; маршрутизирует
 * сигналинг; агрегирует remote-streams.» Интерфейс (концептуально):
 * `onParticipantJoined(id)`, `onParticipantLeft(id)`, `handleSignal(msg)`,
 * `attachLocalTrack(track)`. Ниже интерфейс расширен двумя методами, явно
 * требуемыми правилом инициативы (см. ниже) и уже задокументированной точкой
 * расширения в `mediaController.js` (задача 21, «в рантайме —
 * `MeshManager.getVideoSenders()`»):
 * - `addExistingParticipant(id)` — отдельный от `onParticipantJoined` вход
 *   для снимка `join:ok.participants` (см. правило инициативы ниже);
 * - `getVideoSenders()` — агрегированные video-sender'ы всех соединений, для
 *   `mediaController.toggleVideo()` (Design §3.3 п.2/§7.2 «на всех sender»).
 *
 * Design §3.3 п.1 / §7.1 (Directional mesh, glare-free): «При входе нового
 * участника оферы создают уже присутствующие участники (offerer =
 * «старожил»), новичок только отвечает. Каждой паре соответствует ровно один
 * инициатор → glare исключён без «perfect negotiation».» Правило инициативы
 * (§7.1, дословно): «offerer — участник, который уже был в комнате на
 * момент `participant:joined`. Новичок при получении `join:ok` НЕ
 * инициирует оферы (он их ждёт).»
 *
 * Это два структурно разных клиентских пути, требующих разных методов на
 * границе этого модуля (сервер тоже различает адресатов — Design §7.1
 * sequence: `participant:joined` уходит ТОЛЬКО старожилам, новичок его
 * никогда не получает про самого себя):
 * - `onParticipantJoined(id)` — вызывается, когда СЕРВЕР прислал
 *   `participant:joined` (это происходит только у уже присутствующих
 *   участников про НОВОГО пира) → self является старожилом относительно
 *   этого peerId → инициирует ровно один offer.
 * - `addExistingParticipant(id)` — вызывается при обработке снимка
 *   `join:ok.participants` (участники, которые были в комнате ДО входа
 *   self) → self является новичком относительно этого peerId → только
 *   регистрирует `PeerConnection` и ждёт входящий `signal:offer`, не
 *   инициирует ничего.
 *
 * Design §7.3 (выход/обрыв): `participant:left { id }` → `pc[id].close();
 * убрать плитку`. `onParticipantLeft(id)` закрывает и удаляет соединение из
 * реестра.
 *
 * Design §6.1/§6.2 (сетевой контракт сигналинга): `signal:offer/answer/ice`
 * несут `{ to, sdp|candidate }` исходящими и `{ from, sdp|candidate }`
 * входящими. `handleSignal(msg)` принимает входящую форму (после того, как
 * `signalingClient.on('signal:offer'|'signal:answer'|'signal:ice', cb)`
 * передал payload сюда) и маршрутизирует к нужному `PeerConnection` по
 * `msg.from`; исходящие сообщения отправляются через `deps.emit(event,
 * payload)` (тот же контракт, что `signalingClient.emit`).
 *
 * SEC-18 (Design §8/§10, унаследовано от `PeerConnection.js`): битый/
 * вредоносный SDP/ICE не роняет клиент — `PeerConnection.acceptOffer`/
 * `acceptAnswer`/`addIce` уже перехватывают ошибку и возвращают `null`/
 * `false`; этот модуль лишь не отправляет ответ дальше в таком случае и не
 * падает сам ни при отсутствующем peerId (гонки/поздние сообщения), ни при
 * повторных/неожиданных событиях состава.
 *
 * Requirements: F-06, US-6, US-9. Design: §3.3, §4.2, §7.1, §11.3.
 */
import { createPeerConnection } from './PeerConnection.js';

/**
 * Создаёт изолированный экземпляр mesh-менеджера. Фабрика (не singleton) —
 * тот же приём DI, что `createSignalingClient`/`createMediaController`/
 * `createPeerConnection` (задачи 18/21/22): каждый вход в комнату получает
 * собственное замкнутое состояние (реестр пиров, локальные дорожки).
 *
 * @param {object} [deps]
 * @param {(deps: object) => ReturnType<typeof createPeerConnection>} [deps.createPeerConnection]
 *   — фабрика одного `PeerConnection`, по умолчанию реальная
 *   `createPeerConnection` из `webrtc/PeerConnection.js`; параметр только
 *   для тестируемости (инъекция фейковой обёртки вместо настоящего
 *   `RTCPeerConnection`), тот же приём, что `deps.RTCPeerConnection` в самом
 *   `PeerConnection.js`.
 * @param {RTCIceServer[]} [deps.iceServers] — форвардится в каждый созданный
 *   `PeerConnection` (SEC-17); в рантайме — актуальный список из
 *   `join:ok.iceServers`, если сервер его прислал (см. JSDoc
 *   `PeerConnection.js`), иначе статический `config.ICE_SERVERS` (дефолт
 *   самого `createPeerConnection`, если `deps.iceServers` не передан).
 * @param {(event: string, payload: object) => void} [deps.emit] — отправка
 *   исходящих сигнальных сообщений серверу; в рантайме —
 *   `signalingClient.emit`. По умолчанию no-op (тестируемость/безопасный
 *   дефолт вне сети — не бросает, просто не отправляет).
 * @returns {{
 *   onParticipantJoined: (id: string) => void,
 *   addExistingParticipant: (id: string) => void,
 *   onParticipantLeft: (id: string) => void,
 *   handleSignal: (msg: { type: string, from: string, sdp?: string, candidate?: object }) => void,
 *   attachLocalTrack: (track: MediaStreamTrack, stream?: MediaStream) => void,
 *   getVideoSenders: () => RTCRtpSender[],
 *   getRemoteStream: (id: string) => MediaStream | null,
 *   getPeerIds: () => string[],
 *   onRemoteStream: (cb: (id: string, stream: MediaStream | null) => void) => () => void,
 *   closeAll: () => void,
 * }}
 */
export function createMeshManager(deps = {}) {
  const pcFactory = deps.createPeerConnection ?? createPeerConnection;
  const iceServers = deps.iceServers;
  const emit = deps.emit ?? (() => {});

  /** @type {Map<string, ReturnType<typeof createPeerConnection>>} */
  const peers = new Map();
  /** @type {Map<string, MediaStream>} */
  const remoteStreams = new Map();
  /** @type {Array<{track: MediaStreamTrack, stream: MediaStream | undefined}>} */
  const localTracks = [];
  /**
   * Video-sender каждого соединения, ключ — peerId (по одному видео-sender
   * на пару, симметрично `videoSender` в `PeerConnection.js`). Заполняется
   * при `pc.addTrack(track, stream)` — и в `attachLocalTrack` (для уже
   * существующих пиров), и при воспроизведении `localTracks` на вновь
   * созданном `PeerConnection` (`getOrCreatePeer`) — так `getVideoSenders()`
   * (точка расширения для `mediaController.toggleVideo()`, задача 21)
   * возвращает актуальный список независимо от порядка вызовов
   * `attachLocalTrack`/входа пиров в mesh.
   *
   * @type {Map<string, RTCRtpSender>}
   */
  const videoSenders = new Map();
  /** @type {Set<(id: string, stream: MediaStream | null) => void>} */
  const remoteStreamHandlers = new Set();

  /**
   * @param {ReturnType<typeof createPeerConnection>} pc
   * @param {string} peerId
   * @param {MediaStreamTrack} track
   * @param {MediaStream} [stream]
   */
  function attachTrackToPeer(pc, peerId, track, stream) {
    const sender = pc.addTrack(track, stream);
    if (track && track.kind === 'video') {
      videoSenders.set(peerId, sender);
    }
  }

  /**
   * Оповещает подписчиков `onRemoteStream` об изменении агрегированного
   * потока пира (`stream: null` — поток/соединение удалено). Каждый
   * подписчик изолирован try/catch — тот же приём, что `notifyError` в
   * `signalingClient.js` и обработчики в `PeerConnection.js`: падение
   * одного потребителя не должно глушить остальных.
   *
   * @param {string} id
   * @param {MediaStream | null} stream
   */
  function notifyRemoteStream(id, stream) {
    for (const handler of remoteStreamHandlers) {
      try {
        handler(id, stream);
      } catch {
        // см. комментарий выше.
      }
    }
  }

  /**
   * Регистрирует новый `PeerConnection` для `peerId`, если его ещё нет —
   * идемпотентно (повторный вызов для уже известного пира возвращает
   * существующий экземпляр, не создаёт второй и не переинициирует ничего;
   * защита от дублирования при гоночных/повторных событиях состава).
   * Прикрепляет уже накопленные локальные дорожки (`attachLocalTrack`,
   * вызванный до входа этого пира) — m-line должен существовать до
   * `createOffer()`/`acceptOffer()` (см. `PeerConnection.js`).
   *
   * @param {string} peerId
   * @returns {ReturnType<typeof createPeerConnection>}
   */
  function getOrCreatePeer(peerId) {
    const existing = peers.get(peerId);
    if (existing) {
      return existing;
    }

    const pc = pcFactory(iceServers === undefined ? {} : { iceServers });

    for (const { track, stream } of localTracks) {
      attachTrackToPeer(pc, peerId, track, stream);
    }

    pc.onIceCandidate((candidate) => {
      emit('signal:ice', { to: peerId, candidate });
    });

    pc.onTrack((event) => {
      const stream = (event.streams && event.streams[0]) ?? null;
      if (!stream) {
        // Design §7.1 «агрегирует remote-streams»: без attached MediaStream
        // (нестандартный вызывающий код) агрегировать нечего — просто не
        // падаем, ждём следующее `ontrack` с потоком.
        return;
      }
      remoteStreams.set(peerId, stream);
      notifyRemoteStream(peerId, stream);
    });

    peers.set(peerId, pc);
    return pc;
  }

  /**
   * Design §7.1: вызывается, когда сервер прислал `participant:joined` —
   * это событие сервер отправляет ТОЛЬКО уже присутствующим участникам про
   * нового пира (см. JSDoc модуля/sequence §7.1), поэтому self здесь всегда
   * «старожил» относительно `peerId` и обязан инициировать offer. На пару
   * это даёт ровно один offer: `addExistingParticipant` (см. ниже),
   * симметрично вызываемый на стороне новичка, offer не создаёт.
   *
   * Идемпотентно относительно повторного вызова для уже известного пира —
   * `getOrCreatePeer` не создаёт второе соединение, и offer повторно не
   * инициируется (см. защиту ниже).
   *
   * @param {string} peerId
   * @returns {Promise<void>}
   */
  async function onParticipantJoined(peerId) {
    const isNew = !peers.has(peerId);
    const pc = getOrCreatePeer(peerId);
    if (!isNew) {
      // Уже был зарегистрирован (в т.ч. как existing-участник или повторное
      // событие) — не переинициируем offer повторно (glare-guard).
      return;
    }
    const sdp = await pc.createOffer();
    emit('signal:offer', { to: peerId, sdp });
  }

  /**
   * Design §7.1: вызывается при обработке снимка `join:ok.participants`
   * (участники, присутствовавшие в комнате ДО входа self). Self здесь —
   * «новичок» относительно `peerId`: только регистрирует `PeerConnection` и
   * ждёт входящий `signal:offer` (см. `handleSignal`) — offer НЕ
   * инициирует. Это и есть половина правила directional glare-free mesh,
   * симметричная `onParticipantJoined`.
   *
   * @param {string} peerId
   */
  function addExistingParticipant(peerId) {
    getOrCreatePeer(peerId);
  }

  /**
   * Design §7.3: `participant:left { id }` → закрыть `PeerConnection` и
   * убрать из реестра/агрегированных потоков. Неизвестный `peerId`
   * (гонка/повторное событие) — безопасный no-op, не бросает.
   *
   * @param {string} peerId
   */
  function onParticipantLeft(peerId) {
    const pc = peers.get(peerId);
    if (!pc) {
      return;
    }
    pc.close();
    peers.delete(peerId);
    remoteStreams.delete(peerId);
    videoSenders.delete(peerId);
    notifyRemoteStream(peerId, null);
  }

  /**
   * Маршрутизирует входящее сигнальное сообщение (Design §6.2:
   * `signal:offer/answer/ice { from, sdp|candidate }`) к `PeerConnection`
   * пира `msg.from`. Сам не парсит SDP/ICE — дословно передаёт в
   * `PeerConnection` (SEC-18 обеспечивает уже он).
   *
   * - `type: 'signal:offer'` — «новичок» отвечает на offer старожила:
   *   `PeerConnection` для `from` уже должен существовать (зарегистрирован
   *   через `addExistingParticipant` при входе); если по гонке его ещё нет
   *   — создаётся здесь же (defensive, не роняет клиент), но offer
   *   инициативно не создаётся (только `acceptOffer`). Ответ (`answer`)
   *   отправляется, только если `PeerConnection.acceptOffer` вернул
   *   непустой SDP — битый входящий offer (SEC-18) не порождает answer.
   * - `type: 'signal:answer'` — «старожил» применяет входящий answer к уже
   *   созданному (своим же `onParticipantJoined`) `PeerConnection`;
   *   отсутствующий `from` в реестре — no-op.
   * - `type: 'signal:ice'` — применяется к существующему `PeerConnection`;
   *   отсутствующий `from` — no-op (в т.ч. кандидат, пришедший до создания
   *   соединения или после `onParticipantLeft`).
   *
   * @param {{ type: 'signal:offer' | 'signal:answer' | 'signal:ice', from: string, sdp?: string, candidate?: object }} msg
   * @returns {Promise<void>}
   */
  async function handleSignal(msg) {
    const { type, from } = msg;

    if (type === 'signal:offer') {
      const pc = getOrCreatePeer(from);
      const answerSdp = await pc.acceptOffer(msg.sdp);
      if (answerSdp) {
        emit('signal:answer', { to: from, sdp: answerSdp });
      }
      return;
    }

    const pc = peers.get(from);
    if (!pc) {
      // Гонка/позднее сообщение про уже ушедшего или ещё не
      // зарегистрированного пира — безопасный no-op (SEC-18/robustness).
      return;
    }

    if (type === 'signal:answer') {
      await pc.acceptAnswer(msg.sdp);
      return;
    }

    if (type === 'signal:ice') {
      await pc.addIce(msg.candidate);
    }
  }

  /**
   * Прикрепляет локальную дорожку ко всем текущим `PeerConnection` и
   * запоминает её для всех будущих (создаваемых `onParticipantJoined`/
   * `addExistingParticipant` после этого вызова) — так порядок вызовов
   * mediaController.init() → attachLocalTrack(...) → вход в mesh не важен
   * для уже присутствующих пиров, а для ещё не подключившихся дорожка
   * подставится автоматически при создании их `PeerConnection`.
   *
   * @param {MediaStreamTrack} track
   * @param {MediaStream} [stream]
   */
  function attachLocalTrack(track, stream) {
    localTracks.push({ track, stream });
    for (const [peerId, pc] of peers.entries()) {
      attachTrackToPeer(pc, peerId, track, stream);
    }
  }

  /**
   * Design §3.3 п.2/§7.2 («на всех PeerConnection» / «на всех sender'ах»):
   * агрегированные video-sender'ы всех текущих соединений — точка
   * расширения, уже задокументированная в `mediaController.js` (задача 21,
   * `deps.getVideoSenders()`). Sender без активной видео-дорожки (после
   * `replaceTrack(null)`) всё ещё видео-sender этого соединения — попадает
   * в список, `RTCRtpSender.replaceTrack` на нём работает независимо от
   * текущего `track` (см. `videoSenders`, заполняется через `addTrack`, не
   * зависит от последующих `replaceTrack`).
   *
   * @returns {RTCRtpSender[]}
   */
  function getVideoSenders() {
    return Array.from(videoSenders.values());
  }

  /**
   * @param {string} peerId
   * @returns {MediaStream | null}
   */
  function getRemoteStream(peerId) {
    return remoteStreams.get(peerId) ?? null;
  }

  /** @returns {string[]} */
  function getPeerIds() {
    return Array.from(peers.keys());
  }

  /**
   * Подписка на изменения агрегированных remote-streams (Design §7.1
   * «агрегирует remote-streams»). `stream === null` означает, что поток
   * пира удалён (`onParticipantLeft`/`closeAll`).
   *
   * @param {(id: string, stream: MediaStream | null) => void} cb
   * @returns {() => void} функция отписки.
   */
  function onRemoteStream(cb) {
    remoteStreamHandlers.add(cb);
    return () => remoteStreamHandlers.delete(cb);
  }

  /**
   * Закрывает все текущие соединения и очищает реестр (Design §7.3, выход
   * self из комнаты) — вызывающая сторона (`RoomScreen`, задача 24)
   * использует при размонтировании/выходе.
   */
  function closeAll() {
    for (const peerId of Array.from(peers.keys())) {
      onParticipantLeft(peerId);
    }
  }

  return {
    onParticipantJoined,
    addExistingParticipant,
    onParticipantLeft,
    handleSignal,
    attachLocalTrack,
    getVideoSenders,
    getRemoteStream,
    getPeerIds,
    onRemoteStream,
    closeAll,
  };
}
