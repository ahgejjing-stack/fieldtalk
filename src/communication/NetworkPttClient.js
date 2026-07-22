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
// RC1-WEEK6 §1.2 — 1s, 2s, 4s, 8s, capped at 15s from then on.
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;
// RC1-WEEK6 §1.8 — after this many failed attempts, stop the automatic
// loop and surface "연결이 복구되지 않았습니다" — roughly 1+2+4+8+15+15+15+15s
// ≈ 75s of trying, generous for a genuine dead-zone/LTE-handoff blip
// without retrying forever in the background.
const MAX_RECONNECT_ATTEMPTS = 8;

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
      retryCount: 0, // RC1-WEEK6 §1.7 — DEV diagnostic only
      nextRetrySec: null, // RC1-WEEK6 §1.7 — DEV diagnostic only
      remoteSpeakerUserId: null,
      remoteSpeakerName: null,
      isReceiving: false,
      actualTargetUserIds: [],
      members: [],
      remoteInputLevel: 0,
      // RC4 Issue 4 (Host transfer) — server-authoritative current host,
      // learned on room_joined and updated by host_changed. `hostChangedEvent`
      // is a one-shot signal the UI layer consumes to show a toast.
      hostUserId: null,
      hostChangedEvent: null,
      roundStartedPayload: null, // Runtime Identity v0.4 §9
      reconnectEvent: null, // RC1-WEEK6 §1.8 — one-shot signal for the UI toast layer: "reconnecting" | "reconnected" | "give_up". Cleared by the consumer.
      // RC4 P1-2 — Debug Overlay diagnostics for the "remoteSignalDetected
      // PASS but no audible sound" investigation. Set by the media
      // pipeline; read (via CommunicationProvider) by P0DebugOverlay.
      remoteAudioContextState: null, // "running" | "suspended" | "closed" | null
      remoteTrackAttached: false,
    };

    this.listeners = new Set();
    this._levelRaf = null;
    this._preparePromise = null;
    this._transports = new Map(); // userId -> WebRtcTransport
    this._peerStates = new Map(); // RC1-WEEK7 §4 — userId -> raw RTCPeerConnection state, tracked separately from top-level connectionState
    this._lastSoundEventId = null; // RC3 review — sound_played dedup

    // RC4 P0 — WebRTC Reconnect Lifecycle tracker. Every stage gets
    // exactly one PASS/FAIL record per attempt, logged with the
    // [FIELDTALK P0] prefix and surfaced via getState().p0Lifecycle for
    // the DEV Debug Overlay. Reset at the start of each connectToRoom()
    // attempt so a reconnect's trace never mixes with the initial
    // connection's.
    this._p0Lifecycle = this._makeEmptyP0Lifecycle();
    this._remoteAudioEl = null;
    this._remoteAnalyserCtx = null;
    this._remoteAnalyser = null;
    this._remoteAnalyserData = null;
    this._remoteLevelRaf = null;
    this._joined = false;
    this._disconnectedTimers = new Map(); // userId -> timer, Part B disconnected-grace

    // RC1-WEEK6 §1 — Automatic Reconnection state. `_reconnectTimer` is
    // the ONLY place a reconnect timer is ever stored — §1.3's "한 번에
    // 재연결 타이머는 하나만 존재해야 한다" is enforced by always clearing
    // this before scheduling a new one, everywhere it's touched.
    this._reconnectTimer = null;
    this._reconnectAttempt = 0;
    this._leaving = false; // Priority 2 — set true only by leaveRoom(), blocks any further reconnection
    this._giveUpToastShown = false;

    // §1.6 — the browser's own online event retries immediately instead
    // of waiting out the current backoff. Bound once here so it can be
    // removed in release()/leaveRoom() without leaking a listener.
    this._handleOnline = () => this._attemptReconnect({ immediate: true });
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("online", this._handleOnline);
    }

    this._wireSignaling();
  }

  // ---- RC4 P0: WebRTC Reconnect Lifecycle tracker -----------------------

  _makeEmptyP0Lifecycle() {
    return {
      roomJoin: null,
      offerCreated: null,
      answerReceived: null,
      iceConnectionState: null,
      peerConnectionState: null,
      remoteTrackReceived: null,
      audioElementAttach: null,
      playCalled: null,
      playResult: null,
      // RC4 P0 review — renamed from actualAudioReceived. This is what
      // the analyser can actually attest to: a real, sustained,
      // non-silence signal was measured. It is NOT the same claim as
      // "a person heard audio" — see audiblePlaybackConfirmed below.
      remoteSignalDetected: null,
      // RC4 P0 review — deliberately NEVER set by any code in this
      // client. This field only exists so the Debug Overlay has a
      // placeholder reminding whoever's testing that automatic
      // detection stops at remoteSignalDetected — actually hearing the
      // voice is a real-device, human-confirmed step, not something
      // code can claim to have verified.
      audiblePlaybackConfirmed: null,
    };
  }

  /** One call site for every stage — always logs with the required
   * [FIELDTALK P0] prefix, always updates the same tracker object the
   * Debug Overlay reads, and always includes attempt# and whether this
   * is the initial connection or a reconnect (attempt > 1), so a real
   * device's console log is directly comparable stage-by-stage between
   * the two. */
  _logP0Stage(stage, status, detail) {
    const entry = { status, detail, at: new Date().toISOString(), attempt: this._reconnectAttempt ?? 0 };
    this._p0Lifecycle = { ...this._p0Lifecycle, [stage]: entry };
    if (typeof console !== "undefined") {
      console.log(
        `[FIELDTALK P0] ${stage} = ${status}${detail ? " | " + JSON.stringify(detail) : ""} (attempt=${entry.attempt})`
      );
    }
    this._setState({ p0Lifecycle: this._p0Lifecycle });
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
    // RC4 P1-2 — keep the Debug Overlay diagnostics honest when the media
    // pipeline is gone.
    this._setState({ remoteTrackAttached: false, remoteAudioContextState: null });
  }

  /** The full-session failure path — socket closed/errored, a peer
   * connection failed or stayed disconnected too long, or an explicit
   * leave. Tears down transports and both transmit/remote state, but
   * does NOT release the microphone itself (release() is a separate,
   * broader scope — a connection failure shouldn't necessarily force the
   * user to re-grant mic permission next time). Idempotent. */
  /** RC3 iOS investigation — the original autoplay attempt in
   * _setupRemoteMedia() happens as a side effect of a network event
   * (reconnect, or the initial WebRTC negotiation completing), which is
   * NOT inside a user-gesture call stack. iOS Safari's autoplay policy
   * can silently block that. This retry exists specifically to be
   * called from an actual tap/click handler, where the SAME play() call
   * is much more likely to be allowed. Safe to call even if there's
   * nothing to retry (no-ops cleanly). */
  retryRemoteAudioPlayback() {
    if (!this._remoteAudioEl) return Promise.resolve({ ok: false, reason: "no_remote_audio" });
    return this._remoteAudioEl
      .play()
      .then(() => {
        if (this.state.lastError === "remote_audio_playback_blocked") {
          this._setState({ lastError: null });
        }
        this._setState({
          lastAudioPlaybackAttempt: { ok: true, viaRetry: true, at: new Date().toISOString() },
        });
        return { ok: true };
      })
      .catch((err) => {
        const diagnostic = {
          ok: false,
          errorName: err?.name ?? "unknown",
          errorMessage: err?.message ?? String(err),
          viaRetry: true,
          at: new Date().toISOString(),
        };
        this._setState({ lastError: "remote_audio_playback_blocked", lastAudioPlaybackAttempt: diagnostic });
        if (typeof console !== "undefined") {
          console.warn("[FIELDTALK P0] retry play() also rejected:", diagnostic);
        }
        return { ok: false, reason: err?.message ?? String(err) };
      });
  }

  _cleanupConnection(reason) {
    this._cleanupTransmitState(reason);
    this._clearRemoteSpeakerState();
    this._teardownRemoteMedia(); // genuine session end -- full pipeline teardown is correct here
    for (const timer of this._disconnectedTimers.values()) clearTimeout(timer);
    this._disconnectedTimers.clear();
    for (const transport of this._transports.values()) transport.close();
    this._transports.clear();
    this._peerStates.clear(); // RC1-WEEK7 Priority 2
    this._joined = false; // Part 6: a closed/failed connection is no longer "joined"
    this._setState({ connectionState: "disconnected", lastError: reason ?? this.state.lastError });
  }

  // ---- Signaling wiring -------------------------------------------------

  async connectToRoom({ requireExisting = false } = {}) {
    if (this._joined) return { ok: true };
    this._p0Lifecycle = this._makeEmptyP0Lifecycle(); // RC4 P0 — fresh trace per attempt
    this._setState({ connectionState: "connecting", p0Lifecycle: this._p0Lifecycle });

    try {
      await this.signaling.connect();
    } catch (err) {
      this._setState({ connectionState: "failed", lastError: err?.message ?? String(err) });
      this._logP0Stage("roomJoin", "FAIL", { reason: "signaling_connect_failed", message: err?.message });
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
        unsubDenied?.();
        if (!result.ok) this._logP0Stage("roomJoin", "FAIL", { reason: result.reason });
        resolve(result);
      };

      const timeoutId = setTimeout(() => finish({ ok: false, reason: "join_timeout" }), JOIN_TIMEOUT_MS);

      const unsubJoined = this.signaling.on("room_joined", (msg) => {
        this._joined = true;
        const members = msg.members ?? [];
        const hasOtherMembers = members.some((m) => m.userId && m.userId !== this.identity.userId);
        this._logP0Stage("roomJoin", "PASS", { participants: members.length, roomId: msg.roomId });
        // RC1-WEEK7 Priority 4: a solo room has no peer to wait for, so
        // room_joined alone is "connected". A room with other people in
        // it isn't really usable again until at least one of those
        // peers' RTCPeerConnection is back — "media_reconnecting" holds
        // that honestly instead of claiming "connected" prematurely.
        this._setState({
          connectionState: hasOtherMembers ? "media_reconnecting" : "connected",
          members,
          // RC4 Issue 4 — learn the authoritative host on (re)join. On a
          // reconnect AFTER a transfer, this is how the old host discovers
          // it is no longer host and never auto-reclaims the role.
          hostUserId: msg.hostUserId ?? this.state.hostUserId ?? null,
        });
        this._reconcileMembers(members); // Priority 1/3 — rebuild peer connections
        finish({ ok: true });
      });

      // Part D: "socket close 중 pending join 정리" — a connection drop
      // while we're still waiting for the ack must resolve, not hang.
      const unsubClosed = this.signaling.on("socket_closed", () => finish({ ok: false, reason: "connection_lost_during_join" }));

      // RC4 Session Recovery — a [계속하기] rejoin into an ended/expired
      // room comes back as room_join_denied. Resolve with that reason so
      // the caller can clear the stale activeRoomRef and return Home.
      const unsubDenied = this.signaling.on("room_join_denied", (msg) => {
        this._setState({ lastError: `room_join_denied:${msg.reason ?? "unknown"}` });
        finish({ ok: false, reason: msg.reason ?? "room_join_denied" });
      });

      this.signaling.join(
        this.identity.roomId,
        this.identity.userId,
        this.identity.displayName,
        this.identity.deviceSessionId,
        { requireExisting }
      );
    });
  }

  /** One-shot toast signal consumer, matching clearRoundStartedPayload's
   * pattern — the UI reads reconnectEvent once to show a toast, then
   * clears it so it doesn't re-fire on every re-render. */
  clearReconnectEvent() {
    this._setState({ reconnectEvent: null });
  }

  /** RC1-WEEK6 §1 — the ONE place reconnection is orchestrated, whether
   * triggered by a backoff timer or the browser's `online` event.
   * `{ immediate: true }` (only ever passed by _handleOnline) skips the
   * wait and tries right now; the plain scheduled path computes the
   * backoff from `_reconnectAttempt`. Either way, at most one timer and
   * at most one in-flight connectToRoom() call can exist at a time. */
  _attemptReconnect({ immediate = false } = {}) {
    if (this._leaving) return; // Priority 2: never reconnect after an explicit leave
    if (this._joined || this.state.connectionState === "connecting") return; // already connected/connecting — never a duplicate

    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    if (this._reconnectAttempt >= MAX_RECONNECT_ATTEMPTS && !immediate) {
      // §1.8 "일정 횟수 이상 실패" — stop the automatic loop. `online`
      // regaining connectivity is still a strong enough signal to reset
      // and try again (handled by the `immediate` branch below).
      if (!this._giveUpToastShown) {
        this._giveUpToastShown = true;
        this._setState({ connectionState: "failed", reconnectEvent: "give_up", nextRetrySec: null });
      }
      return;
    }

    if (immediate) {
      // A fresh signal that connectivity may be back — worth a clean
      // restart of the backoff sequence rather than waiting out however
      // much of the old (possibly very long) delay remains.
      this._reconnectAttempt = 0;
      this._giveUpToastShown = false;
      this._runReconnectAttemptNow();
      return;
    }

    const delayMs = Math.min(RECONNECT_BASE_MS * 2 ** this._reconnectAttempt, RECONNECT_MAX_MS);
    this._setState({
      connectionState: "reconnecting",
      retryCount: this._reconnectAttempt,
      nextRetrySec: Math.round(delayMs / 1000),
      reconnectEvent: this._reconnectAttempt === 0 ? "reconnecting" : this.state.reconnectEvent,
    });
    this._reconnectTimer = setTimeout(() => this._runReconnectAttemptNow(), delayMs);
  }

  async _runReconnectAttemptNow() {
    this._reconnectTimer = null;
    if (this._leaving || this._joined) return;
    this._setState({ connectionState: "reconnecting", retryCount: this._reconnectAttempt, nextRetrySec: 0 });

    const result = await this.connectToRoom();
    if (this._leaving) return; // leaveRoom() may have fired while the attempt was in flight

    if (result.ok) {
      this._reconnectAttempt = 0;
      this._giveUpToastShown = false;
      // RC1-WEEK7 Priority 4: room_joined's handler already set
      // connectionState to "connected" (solo room) or "media_reconnecting"
      // (others present) — only announce "reconnected" here for the
      // solo case. The multi-person case waits for
      // _maybeCompleteMediaReconnect() once a peer is actually back.
      if (this.state.connectionState === "connected") {
        this._setState({ reconnectEvent: "reconnected", retryCount: 0, nextRetrySec: null });
      } else {
        this._setState({ retryCount: 0, nextRetrySec: null });
      }
    } else {
      this._reconnectAttempt += 1;
      this._attemptReconnect(); // schedules the next backoff step, or gives up at the cap
    }
  }

  /** Priority 2 — Explicit Leave Room. Distinct from a connection drop:
   * this is the user saying "I'm done", so nothing should try to bring
   * the connection back afterward. Tears down every piece §Priority 2
   * calls out explicitly, in order, and is idempotent. */
  leaveRoom() {
    this._leaving = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this.state.status === COMMUNICATION_STATES.TRANSMITTING) {
      this.signaling.releasePtt();
    }
    // RC4 Issue 4 — tell the server this is a deliberate leave so, if we
    // were host, it transfers ownership immediately instead of waiting out
    // the disconnect grace window. Sent before close() while the socket is
    // still open; harmless no-op if already closed.
    this.signaling.leaveRoom?.();
    this._cleanupConnection("leave_room");
    this.signaling.close();
    this._reconnectAttempt = 0;
    this._giveUpToastShown = false;
    this._setState({ connectionState: "disconnected", reconnectEvent: null, retryCount: 0, nextRetrySec: null, members: [] });
  }

  _wireSignaling() {
    this.signaling.on("member_online", (msg) => {
      this._upsertMember({ userId: msg.userId, displayName: msg.displayName }); // Part E
      // RC4 P1 defense — fires on EVERY member_online, unlike the
      // `members` array (which upserts, so a reconnecting member whose
      // userId is already known doesn't change the array's length at
      // all). RoundProvider's rejoin-sync needs to know "someone (re)
      // joined" as an EVENT, not infer it from a length delta that may
      // never actually happen.
      this._setState({ lastMemberOnlineEvent: { userId: msg.userId, at: Date.now() } });
      // RC1-WEEK7 Priority 1/3.3 — deterministic rule instead of "whoever
      // was already here offers"; also guards duplicate member_online
      // for the same peer from ever creating a second transport.
      if (!this._transports.has(msg.userId) && this._shouldOfferTo(msg.userId)) {
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
      if (!transport) {
        this._logP0Stage("answerReceived", "FAIL", { senderUserId: msg.senderUserId, reason: "no_transport" });
        return;
      }
      try {
        await transport.setRemoteAnswer(msg.sdp);
        this._logP0Stage("answerReceived", "PASS", { senderUserId: msg.senderUserId });
      } catch (err) {
        this._logP0Stage("answerReceived", "FAIL", { senderUserId: msg.senderUserId, message: err?.message ?? String(err) });
      }
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
      // RC4 diagnostic — Stage 3/4: did the broadcast reach THIS client?
      // Host and guest share this path; the label distinguishes them by
      // whether this client is the round's host.
      const amHost = this.state?.hostUserId ? this.state.hostUserId === this.userId : null;
      // eslint-disable-next-line no-console
      console.log(
        amHost === true ? "[HOST]" : amHost === false ? "[GUEST]" : "[CLIENT]",
        "received round_started",
        `roomId=${msg.roomId}`,
        `roundId=${msg.roundId}`,
        `players=${(msg.players ?? []).map((p) => p.id).join(",")}`
      );
      this._setState({ roundStartedPayload: msg });
    });
    this.signaling.on("distance_share", (msg) => {
      // RC1 Networking Recovery — surfaced via state the same way
      // roundStartedPayload is; App.jsx/RoundScreen watches this and
      // dispatches teamDistanceShare() into the local Round Engine on
      // arrival, matching how the SENDER already applied it locally.
      this._setState({ receivedDistanceShare: msg });
    });
    this.signaling.on("sound_played", (msg) => {
      // P0-5 fix — same pattern as receivedDistanceShare. RC3 review
      // §"중복 재생이 없는지": ignore an exact duplicate delivery by
      // eventId, since a fresh JSON.parse gives every delivery a new
      // object reference regardless of whether the underlying event was
      // the same one — without this, React's effect-dependency check
      // would treat a genuine network-level duplicate as a brand new
      // cheer and play it twice.
      if (msg.eventId && msg.eventId === this._lastSoundEventId) return;
      this._lastSoundEventId = msg.eventId ?? null;
      this._setState({ receivedSoundPlayed: msg });
    });
    this.signaling.on("hole_advance", (msg) => {
      // RC4 P1 fix — hole progression was never networked at all; same
      // pattern as receivedDistanceShare/receivedSoundPlayed.
      this._setState({ receivedHoleAdvance: msg });
    });
    this.signaling.on("hole_sync", (msg) => {
      // RC4 P1 defense — rejoin hole-state recovery.
      this._setState({ receivedHoleSync: msg });
    });
    this.signaling.on("round_start_denied", (msg) => {
      // RC4 diagnostic — a denial is a concrete stall cause; surface it.
      // eslint-disable-next-line no-console
      console.warn("[CLIENT] round_start_denied", `reason=${msg.reason}`);
      this._setState({ lastError: `round_start_denied:${msg.reason}` });
    });
    this.signaling.on("host_changed", (msg) => {
      // RC4 Issue 4 (Host transfer) — the server promoted a new host.
      // Surface it via state so App.jsx mirrors it into the Room Engine
      // (round-start / hole-advance gates and the "· Host" badge follow).
      // hostChangedEvent is a one-shot for the toast layer.
      this._setState({
        hostUserId: msg.hostUserId ?? null,
        hostChangedEvent: {
          hostUserId: msg.hostUserId ?? null,
          previousHostUserId: msg.previousHostUserId ?? null,
          reason: msg.reason ?? null,
          at: Date.now(),
        },
      });
    });

    this.signaling.on("connection_state", () => {
      // Informational only — surfaced via members/UI hints in this
      // Prototype, not acted on directly.
    });

    this.signaling.on("socket_closed", () => {
      this._cleanupConnection("socket_closed"); // Part B
      this._attemptReconnect(); // RC1-WEEK6 §1.1 — unexpected drop, not an explicit leave
    });

    this.signaling.on("socket_error", () => {
      this._cleanupConnection("socket_error"); // Part B
      this._attemptReconnect(); // RC1-WEEK6 §1.1
    });
  }

  /** RC1-WEEK7 Priority 1 — deterministic, order-independent offer rule:
   * whichever of the two userIds sorts first (string compare) is always
   * the offerer, the other always answers. This replaces the old
   * "whoever was already in the room offers to the new arrival" rule,
   * which breaks down the moment BOTH sides might be reconnecting near
   * simultaneously (Required Verification C) — there's no longer a
   * well-defined "who was here first" in that case, but userId ordering
   * is always well-defined. */
  _shouldOfferTo(remoteUserId) {
    return this.identity.userId < remoteUserId;
  }

  /** RC1-WEEK7 Priority 3 — treats room_joined's member list as the one
   * authoritative source of "who should I have a peer connection with
   * right now": drops transports for anyone no longer present, and
   * starts connections (per the offer rule) for anyone present who
   * doesn't have one yet. Also fully covers §4 ("본인 userId는 절대
   * remote peer로 만들지 않음") by filtering self out up front. */
  _reconcileMembers(members) {
    const remoteIds = new Set(
      (members ?? []).map((m) => m.userId).filter((id) => id && id !== this.identity.userId)
    );
    for (const [userId, transport] of this._transports) {
      if (!remoteIds.has(userId)) {
        transport.close();
        this._transports.delete(userId);
        this._clearDisconnectedTimer(userId);
      }
    }
    for (const userId of remoteIds) {
      if (this._transports.has(userId)) continue; // §3.3 — never a duplicate
      if (this._shouldOfferTo(userId)) {
        this._initiateOfferTo(userId);
      }
      // else: wait for their offer, which creates the transport on
      // arrival via the "offer" handler's _getOrCreateTransport.
    }
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
      onIceConnectionStateChange: (iceState) => {
        // RC4 P0 stage 4 — "connected"/"completed" count as PASS; anything
        // trending toward failure (failed/disconnected/closed) is FAIL;
        // transitional states (new/checking) are logged as IN_PROGRESS
        // for visibility without claiming a verdict too early.
        const status = ["connected", "completed"].includes(iceState)
          ? "PASS"
          : ["failed", "disconnected", "closed"].includes(iceState)
          ? "FAIL"
          : "IN_PROGRESS";
        this._logP0Stage("iceConnectionState", status, { remoteUserId, iceState });
      },
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
   * connection cleanup.
   * RC1-WEEK7 Priority 4: no longer overwrites the top-level
   * connectionState with the raw per-peer string (that was a real bug —
   * one peer's "checking"/"connecting" could stomp a value the rest of
   * the app expects to be one of a small known set). Peer states are
   * tracked separately in _peerStates; _maybeCompleteMediaReconnect()
   * is the only thing allowed to promote connectionState to "connected"
   * during a reconnect. */
  _handleTransportStateChange(remoteUserId, state) {
    this._peerStates.set(remoteUserId, state);
    this.signaling.sendConnectionState(state);
    // RC4 P0 stage 5.
    const p0Status = state === "connected" ? "PASS" : state === "failed" ? "FAIL" : "IN_PROGRESS";
    this._logP0Stage("peerConnectionState", p0Status, { remoteUserId, state });

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
    if (state === "connected") this._maybeCompleteMediaReconnect();
  }

  /** RC1-WEEK7 Priority 4 — the only place connectionState is promoted
   * from "media_reconnecting" to the final "connected", and the only
   * place the "reconnected" toast fires for a room with other members
   * in it. Solo rooms skip this path entirely (room_joined alone is
   * already "connected" for them — see _runReconnectAttemptNow). */
  _maybeCompleteMediaReconnect() {
    if (this.state.connectionState !== "media_reconnecting") return;
    const anyPeerConnected = Array.from(this._peerStates.values()).some((s) => s === "connected");
    if (!anyPeerConnected) return;
    this._reconnectAttempt = 0;
    this._giveUpToastShown = false;
    this._setState({ connectionState: "connected", reconnectEvent: "reconnected", retryCount: 0, nextRetrySec: null });
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
    try {
      const offer = await transport.createOffer();
      this.signaling.sendOffer(remoteUserId, offer);
      this._logP0Stage("offerCreated", "PASS", { remoteUserId });
    } catch (err) {
      this._logP0Stage("offerCreated", "FAIL", { remoteUserId, message: err?.message ?? String(err) });
      throw err;
    }
  }

  // ---- Part F: remote audio lifecycle ----------------------------------

  _attachRemoteStream(stream) {
    // "새 remote stream이 오면 기존 분석기 완전 정리 후 교체" — always
    // tear down whatever was there before setting up the new one.
    this._teardownRemoteMedia();

    // RC4 P0 stage 6 — is this the very first remote stream this client
    // instance has ever attached, or a later one (necessarily a
    // reconnect, since the only way to get a second onRemoteTrack is a
    // fresh peer connection after the first one was torn down)?
    this._remoteStreamAttachCount = (this._remoteStreamAttachCount ?? 0) + 1;
    const isReconnectAttach = this._remoteStreamAttachCount > 1;
    this._p0Lifecycle = { ...this._p0Lifecycle, remoteSignalDetected: null }; // re-evaluate per attach
    this._p0MaxRms = 0;
    this._p0MaxRawLevel = 0;
    this._logP0Stage("remoteTrackReceived", "PASS", {
      isReconnectAttach,
      attachCount: this._remoteStreamAttachCount,
      trackId: stream.getAudioTracks()[0]?.id,
    });

    this._remoteAudioEl = typeof document !== "undefined" ? document.createElement("audio") : null;
    if (!this._remoteAudioEl) {
      this._logP0Stage("audioElementAttach", "FAIL", { reason: "no_document" });
      this._setupRemoteAnalyser(stream);
      return;
    }
    this._remoteAudioEl.autoplay = true;
    this._remoteAudioEl.srcObject = stream;
    // RC4 P1-2 — expose "a remote track is currently attached" to the
    // Debug Overlay, so the Founder can distinguish "no track at all" from
    // "track attached but silent".
    this._setState({ remoteTrackAttached: true });
    this._logP0Stage("audioElementAttach", "PASS", { isReconnectAttach });

    this._logP0Stage("playCalled", "PASS", { isReconnectAttach }); // stage 8 — the call itself always happens; PASS here means "attempted", not "succeeded"
    const playPromise = this._remoteAudioEl.play?.();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise
        .then(() => {
          const diagnostic = { ok: true, isReconnectAttach, attachCount: this._remoteStreamAttachCount, at: new Date().toISOString() };
          this._setState({ lastAudioPlaybackAttempt: diagnostic });
          this._logP0Stage("playResult", "PASS", diagnostic);
        })
        .catch((err) => {
          const diagnostic = {
            ok: false,
            errorName: err?.name ?? "unknown",
            errorMessage: err?.message ?? String(err),
            isReconnectAttach,
            attachCount: this._remoteStreamAttachCount,
            at: new Date().toISOString(),
          };
          this._setState({ lastError: "remote_audio_playback_blocked", lastAudioPlaybackAttempt: diagnostic });
          this._logP0Stage("playResult", "FAIL", diagnostic);
        });
    }
    this._setupRemoteAnalyser(stream);
  }

  _setupRemoteAnalyser(stream) {
    if (typeof window === "undefined" || !(window.AudioContext || window.webkitAudioContext)) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this._remoteAnalyserCtx = new Ctx();
    // RC4 P1-2 — surface the AudioContext state to the Debug Overlay so a
    // Founder testing on a phone (no desktop console) can see whether it's
    // "suspended" (a classic iOS autoplay-before-gesture cause of the
    // "remoteSignalDetected PASS but no sound" symptom) vs "running".
    this._setState({ remoteAudioContextState: this._remoteAnalyserCtx.state ?? null });
    this._remoteAnalyserCtx.onstatechange = () => {
      this._setState({ remoteAudioContextState: this._remoteAnalyserCtx?.state ?? null });
    };
    const source = this._remoteAnalyserCtx.createMediaStreamSource(stream);
    this._remoteAnalyser = this._remoteAnalyserCtx.createAnalyser();
    this._remoteAnalyser.fftSize = 256;
    source.connect(this._remoteAnalyser);
    this._remoteAnalyserData = new Uint8Array(this._remoteAnalyser.frequencyBinCount);
    this._startRemoteLevelLoop();
  }

  _startRemoteLevelLoop() {
    const usesRaf = typeof requestAnimationFrame === "function";
    const attachCountAtStart = this._remoteStreamAttachCount; // RC4 P0 — tie this loop's detection to the specific attach it belongs to
    // RC4 P0 review — sustained-detection window: a single instant peak
    // (one frame over threshold) isn't good enough evidence, since a
    // brief spike could be noise/artifact. Require the signal to stay
    // above threshold continuously for this long before declaring PASS.
    const SUSTAINED_DETECTION_MS = 150;
    let aboveThresholdSinceMs = null;
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

      // RC4 P0 review — Debug Overlay diagnostics: current + peak values,
      // tracked regardless of isReceiving so the overlay always shows
      // what the analyser is actually measuring right now.
      this._p0MaxRms = Math.max(this._p0MaxRms ?? 0, rms);
      this._p0MaxRawLevel = Math.max(this._p0MaxRawLevel ?? 0, rawLevel);
      this._setState({
        p0LevelDebug: {
          rms: Number(rms.toFixed(4)),
          rawLevel: Number(rawLevel.toFixed(4)),
          threshold: NETWORK_VOICE_DETECTED_THRESHOLD,
          maxRms: Number(this._p0MaxRms.toFixed(4)),
          maxRawLevel: Number(this._p0MaxRawLevel.toFixed(4)),
        },
      });

      // RC4 P0 review — stage 10, renamed remoteSignalDetected: fixed to
      // compare the SAME scaled rawLevel that voiceDetected/the UI meter
      // use (previously compared raw, unscaled rms against a threshold
      // tuned for the scaled value — meaning a rawLevel that visibly
      // crossed the meter's own threshold could still fail this stage).
      // Also now requires SUSTAINED_DETECTION_MS of continuous signal,
      // not a single instant peak.
      const isAboveThreshold = this.state.isReceiving && rawLevel > NETWORK_VOICE_DETECTED_THRESHOLD;
      if (isAboveThreshold) {
        if (aboveThresholdSinceMs == null) aboveThresholdSinceMs = Date.now();
        const sustainedMs = Date.now() - aboveThresholdSinceMs;
        if (
          sustainedMs >= SUSTAINED_DETECTION_MS &&
          !this._p0Lifecycle.remoteSignalDetected &&
          this._remoteStreamAttachCount === attachCountAtStart
        ) {
          this._logP0Stage("remoteSignalDetected", "PASS", {
            rms: rms.toFixed(4),
            rawLevel: rawLevel.toFixed(4),
            sustainedMs,
            attachCount: attachCountAtStart,
          });
        }
      } else {
        aboveThresholdSinceMs = null;
      }

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

  /** RC4 Issue 4 — one-shot consumer for the host-changed toast signal. */
  clearHostChangedEvent() {
    this._setState({ hostChangedEvent: null });
  }

  /** RC1 Networking Recovery — actually sends a distance share to the
   * rest of the room. Callers (DistanceCard.jsx) still ALSO dispatch
   * locally themselves, same as before — this only adds the network
   * relay that was missing, it doesn't change local-apply behavior. */
  shareDistance({ referenceDistanceM, source, holeNumber }) {
    this.signaling.sendDistanceShare({ referenceDistanceM, source, holeNumber });
  }

  /** P0-5 fix — cheer/sound effects broadcast. */
  shareSoundPlayed({ soundId, category, label, targetUserIds }) {
    this.signaling.sendSoundPlayed({ soundId, category, label, targetUserIds });
  }

  /** RC4 P1 fix — actually tells the rest of the room a hole advanced. */
  shareHoleAdvance({ completedHoleNumber, nextHoleNumber }) {
    this.signaling.sendHoleAdvance({ completedHoleNumber, nextHoleNumber });
  }

  /** RC4 P1 defense — rejoin hole-state recovery. */
  shareHoleSync({ currentHoleNumber, targetUserId }) {
    this.signaling.sendHoleSync({ currentHoleNumber, targetUserId });
  }

  clearReceivedDistanceShare() {
    this._setState({ receivedDistanceShare: null });
  }

  clearReceivedSoundPlayed() {
    this._setState({ receivedSoundPlayed: null });
  }

  clearReceivedHoleAdvance() {
    this._setState({ receivedHoleAdvance: null });
  }

  clearReceivedHoleSync() {
    this._setState({ receivedHoleSync: null });
  }

  release() {
    this._leaving = true; // RC1-WEEK6 §1 — a full release must not trigger reconnection either
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (typeof window !== "undefined" && window.removeEventListener) {
      window.removeEventListener("online", this._handleOnline);
    }
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
