/**
 * NetworkPttClient.js
 * ------------------------------------------------------------------
 * Two Device PTT Foundation v0.1, Bidirectional Hardening v0.2 Parts
 * A/B/D/E/F — the network implementation of PttClient. Same public
 * interface as LocalPttClient, so CommunicationProvider.jsx can hold
 * either behind the exact same `communication.*` surface PTTButton.jsx
 * calls.
 *
 * Part A — bidirectional media fix: v0.1 only ever called prepare()
 * before the OFFERER created an offer. The ANSWERER's `offer` handler
 * created its transport without ever preparing the mic first, so if the
 * answerer hadn't separately warmed up (e.g. via the Room's "마이크
 * 준비" button), its answer never carried a local track — audio only
 * ever flowed offerer→answerer, never the reverse, and this Prototype
 * never renegotiates to fix that after the fact. Fix (Option A, chosen
 * over Option B/renegotiation for Prototype simplicity — see the Sprint
 * 결과 보고 for the reasoning): both connectToRoom() AND the `offer`
 * handler now call prepare() before any transport is created, so
 * whichever side sends SDP first, its local track is already attached.
 *
 * Part B — unified cleanup: four private methods
 * (_cleanupTransmitState/_clearRemoteSpeakerState/_teardownRemoteMedia/
 * _cleanupConnection) are the ONLY place any of this logic lives; every
 * failure path (socket close/error, RTCPeerConnection failed/
 * disconnected-timeout, remote track ended, ptt_expired, explicit
 * release) calls into them instead of duplicating cleanup steps inline.
 *
 * Repeated Transmission Hotfix v0.3 — root cause + fix: v0.2's single
 * `_cleanupRemoteState()` tore down the ENTIRE remote media pipeline
 * (audio element/analyser/AudioContext) on every ordinary PTT end
 * (`speaker_changed` with speakerUserId=null). But WebRTC only fires
 * `ontrack` once per track ADDITION, not on every enabled true/false
 * toggle — so the second PTT press on the same still-alive track never
 * got its analyser reattached, and remoteInputLevel stayed stuck at 0
 * forever after. Fixed by splitting that one method into
 * `_clearRemoteSpeakerState()` (UI/receiver-session fields only, called
 * on every ordinary PTT end) and `_teardownRemoteMedia()` (the real
 * pipeline teardown, called only for genuine session-ending events:
 * track ended, member offline, connection failed, explicit release, or a
 * fresh stream replacing a stale one).
 * ------------------------------------------------------------------
 */
import { PttClient } from "./PttClient.js";
import { COMMUNICATION_STATES } from "./communicationState.js";

const NETWORK_VOICE_DETECTED_THRESHOLD = 0.06; // same visual-only threshold as LocalPttClient
const JOIN_TIMEOUT_MS = 5000; // Part D
const DISCONNECTED_GRACE_MS = 5000; // Part B — "disconnected가 timeout 이상 지속"

export class NetworkPttClient extends PttClient {
  /**
   * @param {object} deps
   * @param {import("./AudioCapture.js").AudioCapture} deps.audioCapture
   * @param {import("./PttSignalingClient.js").PttSignalingClient} deps.signalingClient
   * @param {{roomId: string, userId: string, displayName: string, deviceSessionId: string}} deps.identity
   * @param {RTCIceServer[]} [deps.iceServers]
   * @param {typeof import("./WebRtcTransport.js").WebRtcTransport} [deps.WebRtcTransportClass] - injectable for tests
   */
  constructor({ audioCapture, signalingClient, identity, iceServers = [], WebRtcTransportClass }) {
    super();
    this.audioCapture = audioCapture;
    this.signaling = signalingClient;
    this.identity = identity;
    this.iceServers = iceServers;
    this.WebRtcTransportClass = WebRtcTransportClass;

    this.state = {
      status: COMMUNICATION_STATES.IDLE,
      permissionStatus: "prompt",
      inputLevel: 0,
      rawInputLevel: 0,
      voiceDetected: false,
      isTesting: false,
      lastError: null,
      connectionState: "disconnected",
      remoteSpeakerUserId: null,
      remoteSpeakerName: null,
      isReceiving: false,
      actualTargetUserIds: [],
      members: [],
      remoteInputLevel: 0,
      roundStartedPayload: null, // Runtime Identity v0.4 §9
    };

    this.listeners = new Set();
    this._levelRaf = null;
    this._preparePromise = null;
    this._transports = new Map(); // userId -> WebRtcTransport
    this._remoteAudioEl = null;
    this._remoteAnalyserCtx = null;
    this._remoteAnalyser = null;
    this._remoteAnalyserData = null;
    this._remoteLevelRaf = null;
    this._joined = false;
    this._disconnectedTimers = new Map(); // userId -> timer, Part B disconnected-grace

    this._wireSignaling();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState() {
    return this.state;
  }

  _setState(patch) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  _resolveDisplayName(userId) {
    return this.state.members.find((m) => m.userId === userId)?.displayName ?? userId;
  }

  // ---- Part E: member list upsert, no duplicates ----------------------

  _upsertMember(member) {
    const exists = this.state.members.some((m) => m.userId === member.userId);
    const members = exists
      ? this.state.members.map((m) => (m.userId === member.userId ? { ...m, ...member } : m))
      : [...this.state.members, member];
    this._setState({ members });
  }

  _removeMember(userId) {
    this._setState({ members: this.state.members.filter((m) => m.userId !== userId) });
  }

  // ---- Part B: unified cleanup ----------------------------------------

  /** Stops MY OWN transmission for any reason — normal release, denial,
   * or an external failure. Always safe to call even when not
   * transmitting (no-op beyond resetting level fields). */
  _cleanupTransmitState(reason) {
    this._stopLevelLoop();
    this.audioCapture.setActive(false);
    if (this.state.status === COMMUNICATION_STATES.TRANSMITTING) {
      this._setState({
        status: COMMUNICATION_STATES.READY,
        inputLevel: 0,
        rawInputLevel: 0,
        voiceDetected: false,
        lastError: reason ?? this.state.lastError,
      });
    }
  }

  /** Part 2A (Repeated Transmission Hotfix v0.3) — resets only the
   * RECEIVER SESSION STATE (who's speaking, am I a target, displayed
   * level). Safe and correct to call on every ordinary PTT end
   * (speaker_changed with speakerUserId=null, or a new speaker_changed
   * where I'm no longer a target) — this does NOT touch the underlying
   * WebRTC media pipeline (audio element/analyser/AudioContext), because
   * a normal PTT release is not a track/connection teardown. The
   * v0.2 bug: `_cleanupRemoteState()` used to ALSO tear down the remote
   * media pipeline here, so the second PTT press on the same
   * (still-alive) track never got its analyser reattached — WebRTC only
   * fires `ontrack` once per track addition, not on every enabled
   * true/false toggle, so nothing ever re-triggered `_attachRemoteStream()`. */
  _clearRemoteSpeakerState() {
    this._setState({
      remoteSpeakerUserId: null,
      remoteSpeakerName: null,
      isReceiving: false,
      actualTargetUserIds: [],
      remoteInputLevel: 0,
    });
  }

  /** Part 2B (Repeated Transmission Hotfix v0.3) — the REAL remote media
   * pipeline teardown (audio element, analyser, AudioContext, RAF/timer).
   * Only ever called for genuine session-ending events: remote track
   * ended, member offline, peer connection failed/closed, signaling
   * session end, explicit leave/release, or a fresh remote stream
   * replacing a stale one. Never called just because a PTT ended. */
  _teardownRemoteMedia() {
    if (this._remoteAudioEl) {
      this._remoteAudioEl.pause?.();
      this._remoteAudioEl.srcObject = null;
      this._remoteAudioEl = null;
    }
    if (this._remoteLevelRaf != null) {
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(this._remoteLevelRaf);
      else clearTimeout(this._remoteLevelRaf);
      this._remoteLevelRaf = null;
    }
    if (this._remoteAnalyserCtx) {
      this._remoteAnalyserCtx.close().catch(() => {});
      this._remoteAnalyserCtx = null;
      this._remoteAnalyser = null;
      this._remoteAnalyserData = null;
    }
  }

  /** The full-session failure path — socket closed/errored, a peer
   * connection failed or stayed disconnected too long, or an explicit
   * leave. Tears down transports and both transmit/remote state, but
   * does NOT release the microphone itself (release() is a separate,
   * broader scope — a connection failure shouldn't necessarily force the
   * user to re-grant mic permission next time). Idempotent. */
  _cleanupConnection(reason) {
    this._cleanupTransmitState(reason);
    this._clearRemoteSpeakerState();
    this._teardownRemoteMedia(); // genuine session end -- full pipeline teardown is correct here
    for (const timer of this._disconnectedTimers.values()) clearTimeout(timer);
    this._disconnectedTimers.clear();
    for (const transport of this._transports.values()) transport.close();
    this._transports.clear();
    this._joined = false; // Part 6: a closed/failed connection is no longer "joined"
    this._setState({ connectionState: "disconnected", lastError: reason ?? this.state.lastError });
  }

  // ---- Signaling wiring -------------------------------------------------

  async connectToRoom() {
    if (this._joined) return { ok: true };
    this._setState({ connectionState: "connecting" });

    try {
      await this.signaling.connect();
    } catch (err) {
      this._setState({ connectionState: "failed", lastError: err?.message ?? String(err) });
      return { ok: false, reason: "signaling_connect_failed" };
    }

    // Part A: prepare the mic in parallel with the join handshake — by
    // the time any offer/answer needs to happen, the track already
    // exists, whichever side ends up generating SDP first.
    if (!this.audioCapture.stream) {
      this.prepare(); // deliberately not awaited — must not block room_joined ack
    }

    // Part D: only resolve {ok:true} once room_joined actually arrives —
    // never at "we sent room_join" time.
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        unsubJoined();
        unsubClosed();
        resolve(result);
      };

      const timeoutId = setTimeout(() => finish({ ok: false, reason: "join_timeout" }), JOIN_TIMEOUT_MS);

      const unsubJoined = this.signaling.on("room_joined", (msg) => {
        this._joined = true;
        this._setState({ connectionState: "connected", members: msg.members ?? [] });
        finish({ ok: true });
      });

      // Part D: "socket close 중 pending join 정리" — a connection drop
      // while we're still waiting for the ack must resolve, not hang.
      const unsubClosed = this.signaling.on("socket_closed", () => finish({ ok: false, reason: "connection_lost_during_join" }));

      this.signaling.join(this.identity.roomId, this.identity.userId, this.identity.displayName, this.identity.deviceSessionId);
    });
  }

  _wireSignaling() {
    this.signaling.on("member_online", (msg) => {
      this._upsertMember({ userId: msg.userId, displayName: msg.displayName }); // Part E
      // Only the side that was ALREADY in the room offers to the new
      // arrival — avoids both sides racing to offer (glare). Guard
      // against acting twice on a duplicate member_online for the same
      // peer (Part E "같은 member_online 2회").
      if (!this._transports.has(msg.userId)) {
        this._initiateOfferTo(msg.userId);
      }
    });

    this.signaling.on("member_offline", (msg) => {
      this._removeMember(msg.userId); // Part E
      if (this.state.remoteSpeakerUserId === msg.userId) {
        this._clearRemoteSpeakerState();
        this._teardownRemoteMedia(); // genuine disconnect of that member's track
      }
      const transport = this._transports.get(msg.userId);
      if (transport) {
        transport.close();
        this._transports.delete(msg.userId);
      }
      this._clearDisconnectedTimer(msg.userId);
    });

    this.signaling.on("offer", async (msg) => {
      // Part A fix: the answerer must also be warm BEFORE creating the
      // transport that generates the answer, or its own track never
      // makes it into the very first SDP exchange.
      if (!this.audioCapture.stream) {
        await this.prepare();
      }
      const transport = this._getOrCreateTransport(msg.senderUserId);
      const answer = await transport.createAnswerFor(msg.sdp);
      this.signaling.sendAnswer(msg.senderUserId, answer);
    });

    this.signaling.on("answer", async (msg) => {
      const transport = this._transports.get(msg.senderUserId);
      if (transport) await transport.setRemoteAnswer(msg.sdp);
    });

    this.signaling.on("ice_candidate", async (msg) => {
      const transport = this._transports.get(msg.senderUserId);
      if (transport) await transport.addIceCandidate(msg.candidate); // Part C: queues internally if needed
    });

    this.signaling.on("speaker_changed", (msg) => {
      const amITarget = (msg.targetUserIds ?? []).includes(this.identity.userId);
      const isSomeoneElseSpeaking = !!msg.speakerUserId && msg.speakerUserId !== this.identity.userId;
      if (!msg.speakerUserId) {
        // Core fix (Repeated Transmission Hotfix v0.3): a normal PTT
        // release is NOT a WebRTC track/connection teardown — only clear
        // receiver session state, keep the media pipeline (analyser,
        // audio element, AudioContext) alive so the next PTT on the same
        // track is measured immediately, without waiting for a new
        // `ontrack` that will never come.
        this._clearRemoteSpeakerState();
        return;
      }
      if (!amITarget) {
        // Someone is speaking, but not to me — same "receiver state only"
        // rule applies; the media pipeline (if any exists for that peer)
        // is untouched.
        this._clearRemoteSpeakerState();
        return;
      }
      this._setState({
        remoteSpeakerUserId: msg.speakerUserId,
        remoteSpeakerName: this._resolveDisplayName(msg.speakerUserId),
        isReceiving: isSomeoneElseSpeaking && amITarget,
        actualTargetUserIds: msg.targetUserIds ?? [],
      });
    });

    this.signaling.on("ptt_expired", () => {
      this._cleanupTransmitState("ptt_expired");
    });

    // Runtime Identity v0.4 §9 — surfaced via state; App.jsx watches
    // `roundStartedPayload` and dispatches the Round action + navigates.
    // Not consumed/dispatched HERE, because NetworkPttClient must never
    // touch Round Engine directly (Communication layer owns transport
    // only — see docs/REAL_PTT_ARCHITECTURE_v1.md's domain boundary).
    this.signaling.on("round_started", (msg) => {
      this._setState({ roundStartedPayload: msg });
    });
    this.signaling.on("round_start_denied", (msg) => {
      this._setState({ lastError: `round_start_denied:${msg.reason}` });
    });

    this.signaling.on("connection_state", () => {
      // Informational only — surfaced via members/UI hints in this
      // Prototype, not acted on directly.
    });

    this.signaling.on("socket_closed", () => {
      this._cleanupConnection("socket_closed"); // Part B
    });

    this.signaling.on("socket_error", () => {
      this._cleanupConnection("socket_error"); // Part B
    });
  }

  _getOrCreateTransport(remoteUserId) {
    let transport = this._transports.get(remoteUserId);
    if (transport) return transport;

    const TransportClass = this.WebRtcTransportClass;
    transport = new TransportClass({
      iceServers: this.iceServers,
      onIceCandidate: (candidate) => this.signaling.sendIceCandidate(remoteUserId, candidate),
      onRemoteTrack: (stream) => this._attachRemoteStream(stream),
      onTrackEnded: () => {
        this._clearRemoteSpeakerState();
        this._teardownRemoteMedia(); // Part F: remote track ended -> full pipeline teardown
      },
      onConnectionStateChange: (state) => this._handleTransportStateChange(remoteUserId, state),
    });

    if (this.audioCapture.stream) {
      const track = this.audioCapture.stream.getAudioTracks()[0];
      if (track) transport.addLocalTrack(track, this.audioCapture.stream);
    }

    this._transports.set(remoteUserId, transport);
    return transport;
  }

  /** Part B: RTCPeerConnection state changes funnel through here — a
   * "failed" state, or a "disconnected" state that doesn't recover
   * within DISCONNECTED_GRACE_MS, both trigger the same unified
   * connection cleanup. */
  _handleTransportStateChange(remoteUserId, state) {
    this._setState({ connectionState: state === "connected" ? "connected" : state });
    this.signaling.sendConnectionState(state);

    if (state === "failed") {
      this._clearDisconnectedTimer(remoteUserId);
      this._cleanupConnection(`peer_connection_failed:${remoteUserId}`);
      return;
    }
    if (state === "disconnected") {
      this._clearDisconnectedTimer(remoteUserId);
      const timer = setTimeout(() => {
        this._disconnectedTimers.delete(remoteUserId);
        this._cleanupConnection(`peer_connection_disconnected_timeout:${remoteUserId}`);
      }, DISCONNECTED_GRACE_MS);
      if (typeof timer.unref === "function") timer.unref();
      this._disconnectedTimers.set(remoteUserId, timer);
      return;
    }
    // Recovered (e.g. back to "connected") before the grace period fired.
    this._clearDisconnectedTimer(remoteUserId);
  }

  _clearDisconnectedTimer(remoteUserId) {
    const timer = this._disconnectedTimers.get(remoteUserId);
    if (timer) {
      clearTimeout(timer);
      this._disconnectedTimers.delete(remoteUserId);
    }
  }

  async _initiateOfferTo(remoteUserId) {
    if (!this.audioCapture.stream) {
      await this.prepare();
    }
    const transport = this._getOrCreateTransport(remoteUserId);
    const offer = await transport.createOffer();
    this.signaling.sendOffer(remoteUserId, offer);
  }

  // ---- Part F: remote audio lifecycle ----------------------------------

  _attachRemoteStream(stream) {
    // "새 remote stream이 오면 기존 분석기 완전 정리 후 교체" — always
    // tear down whatever was there before setting up the new one.
    this._teardownRemoteMedia();

    this._remoteAudioEl = typeof document !== "undefined" ? document.createElement("audio") : null;
    if (this._remoteAudioEl) {
      this._remoteAudioEl.autoplay = true;
      this._remoteAudioEl.srcObject = stream;
      this._remoteAudioEl.play?.().catch(() => {
        this._setState({ lastError: "remote_audio_playback_blocked" });
      });
    }
    this._setupRemoteAnalyser(stream);
  }

  _setupRemoteAnalyser(stream) {
    if (typeof window === "undefined" || !(window.AudioContext || window.webkitAudioContext)) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this._remoteAnalyserCtx = new Ctx();
    const source = this._remoteAnalyserCtx.createMediaStreamSource(stream);
    this._remoteAnalyser = this._remoteAnalyserCtx.createAnalyser();
    this._remoteAnalyser.fftSize = 256;
    source.connect(this._remoteAnalyser);
    this._remoteAnalyserData = new Uint8Array(this._remoteAnalyser.frequencyBinCount);
    this._startRemoteLevelLoop();
  }

  _startRemoteLevelLoop() {
    const usesRaf = typeof requestAnimationFrame === "function";
    const tick = () => {
      if (!this._remoteAnalyser) return;
      this._remoteAnalyser.getByteTimeDomainData(this._remoteAnalyserData);
      let sumSquares = 0;
      for (let i = 0; i < this._remoteAnalyserData.length; i += 1) {
        const v = (this._remoteAnalyserData[i] - 128) / 128;
        sumSquares += v * v;
      }
      const rms = Math.sqrt(sumSquares / this._remoteAnalyserData.length);
      // Repeated Transmission Hotfix v0.3 §3: the analyser itself keeps
      // measuring continuously for the lifetime of the media pipeline —
      // this loop is never stopped/restarted by ordinary PTT start/stop,
      // only by _teardownRemoteMedia(). But the field the UI actually
      // reads only reflects a real number while `isReceiving` is true;
      // otherwise it's forced to 0 even though the analyser is still
      // technically "listening" (to silence, between PTT presses).
      const rawLevel = Math.min(1, rms * 4);
      this._setState({ remoteInputLevel: this.state.isReceiving ? rawLevel : 0 });
      this._remoteLevelRaf = usesRaf ? requestAnimationFrame(tick) : setTimeout(tick, 50);
      if (!usesRaf && typeof this._remoteLevelRaf.unref === "function") this._remoteLevelRaf.unref();
    };
    this._remoteLevelRaf = usesRaf ? requestAnimationFrame(tick) : setTimeout(tick, 50);
    if (!usesRaf && typeof this._remoteLevelRaf.unref === "function") this._remoteLevelRaf.unref();
  }

  // ---- PttClient interface --------------------------------------------

  async prepare() {
    if (this.state.status === COMMUNICATION_STATES.READY || this.state.status === COMMUNICATION_STATES.TRANSMITTING) {
      return { ok: true };
    }
    if (this._preparePromise) return this._preparePromise;

    this._preparePromise = (async () => {
      this._setState({ status: COMMUNICATION_STATES.PREPARING, lastError: null });
      try {
        await this.audioCapture.acquire();
        this._setState({ status: COMMUNICATION_STATES.READY, permissionStatus: "granted", lastError: null });
        return { ok: true };
      } catch (err) {
        const denied = err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError";
        this._setState({
          status: denied ? COMMUNICATION_STATES.PERMISSION_DENIED : COMMUNICATION_STATES.UNAVAILABLE,
          permissionStatus: denied ? "denied" : this.state.permissionStatus,
          lastError: err?.message ?? String(err),
        });
        return { ok: false, reason: denied ? "permission_denied" : "unavailable" };
      } finally {
        this._preparePromise = null;
      }
    })();

    return this._preparePromise;
  }

  async requestTransmit(targetUserIds) {
    if (!targetUserIds || targetUserIds.length === 0) {
      return { ok: false, reason: "no_target" };
    }
    if (this.state.status === COMMUNICATION_STATES.TRANSMITTING) {
      return { ok: true };
    }
    if (this.state.status !== COMMUNICATION_STATES.READY) {
      const prepared = await this.prepare();
      if (!prepared.ok) return prepared;
    }

    const lockResult = await this.signaling.requestPtt(targetUserIds);
    if (lockResult.type !== "ptt_granted") {
      return { ok: false, reason: lockResult.reason ?? "denied" };
    }

    this.audioCapture.setActive(true);
    this._setState({ status: COMMUNICATION_STATES.TRANSMITTING, inputLevel: 0 });
    this._startLevelLoop();
    return { ok: true };
  }

  stopTransmit() {
    if (this.state.status !== COMMUNICATION_STATES.TRANSMITTING) return;
    this.signaling.releasePtt();
    this._cleanupTransmitState("stopTransmit"); // Part B — single code path
  }

  /**
   * Real Round UX Audit v1.0 §1 — "마이크 준비 + PTT 테스트 통합". Same
   * local-only self-check as LocalPttClient — never requests the server
   * PTT lock, never broadcasts speaker_changed, never touches Round
   * Engine. Deliberately bypasses signaling entirely so a Pre-Round mic
   * test can never consume the shared single-speaker lock a teammate
   * might be about to use.
   *
   * Known limitation (documented, not fixed this Sprint): this Prototype
   * is WebRTC Mesh (see docs/TWO_DEVICE_PTT_v0.1.md §17) — if a peer
   * connection to another room member is ALREADY established at the time
   * of this test (i.e., they joined before you tested), enabling the
   * shared local track is physically audible to that already-connected
   * peer, even though no speaker_changed was sent and their UI shows no
   * "말하는 중" indicator for it. This is a pre-existing Mesh routing
   * constraint (the eventual SFU migration would let a track be enabled
   * without being routed to anyone), not something newly introduced
   * here. In practice this only matters for the rare case of testing
   * your mic AFTER a teammate has already joined and connected.
   */
  async startLocalTest() {
    if (this.state.status !== COMMUNICATION_STATES.READY && this.state.status !== COMMUNICATION_STATES.TRANSMITTING) {
      const prepared = await this.prepare();
      if (!prepared.ok) return prepared;
    }
    this.audioCapture.setActive(true);
    this._setState({ isTesting: true, inputLevel: 0, rawInputLevel: 0, voiceDetected: false });
    this._startLevelLoop();
    return { ok: true };
  }

  stopLocalTest() {
    if (!this.state.isTesting) return;
    this.audioCapture.setActive(false);
    this._stopLevelLoop();
    this._setState({ isTesting: false, inputLevel: 0, rawInputLevel: 0, voiceDetected: false });
  }

  /** Runtime Identity v0.4 §9 — Host calls this once, after building the
   * Round locally via buildInitialRoundFromRoom.js, to also broadcast it
   * to the rest of the room. */
  sendRoundStart(payload) {
    this.signaling.sendRoundStart(payload);
  }

  /** The receiving side calls this once it has consumed
   * state.roundStartedPayload (dispatched the Round action, navigated) —
   * prevents re-triggering navigation on every subsequent re-render. */
  clearRoundStartedPayload() {
    this._setState({ roundStartedPayload: null });
  }

  release() {
    if (this.state.status === COMMUNICATION_STATES.TRANSMITTING) {
      this.signaling.releasePtt();
    }
    this._cleanupConnection("release"); // Part B
    this.audioCapture.release();
    this.signaling.close();
    this._joined = false;
    this._setState({ status: COMMUNICATION_STATES.IDLE, isTesting: false, inputLevel: 0, rawInputLevel: 0, voiceDetected: false });
  }

  _startLevelLoop() {
    const usesRaf = typeof requestAnimationFrame === "function";
    const tick = () => {
      const level = this.audioCapture.getLevel();
      const rawLevel = typeof this.audioCapture.getRawLevel === "function" ? this.audioCapture.getRawLevel() : level;
      this._setState({
        inputLevel: level,
        rawInputLevel: rawLevel,
        voiceDetected: rawLevel > NETWORK_VOICE_DETECTED_THRESHOLD,
      });
      if (this.state.status === COMMUNICATION_STATES.TRANSMITTING || this.state.isTesting) {
        this._levelRaf = usesRaf ? requestAnimationFrame(tick) : setTimeout(tick, 50);
        if (!usesRaf && typeof this._levelRaf.unref === "function") this._levelRaf.unref();
      }
    };
    this._levelRaf = usesRaf ? requestAnimationFrame(tick) : setTimeout(tick, 50);
    if (!usesRaf && typeof this._levelRaf.unref === "function") this._levelRaf.unref();
  }

  _stopLevelLoop() {
    if (this._levelRaf == null) return;
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(this._levelRaf);
    else clearTimeout(this._levelRaf);
    this._levelRaf = null;
  }
}
