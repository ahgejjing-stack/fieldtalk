/**
 * PttSignalingClient.js
 * ------------------------------------------------------------------
 * Two Device PTT Foundation v0.1 §4/§6 — the browser-side counterpart to
 * server/signalingServer.js. Wraps the native WebSocket; NetworkPttClient
 * is the only file that talks to this — PTTButton.jsx and everything
 * above it still knows nothing about WebSocket/WebRTC.
 * ------------------------------------------------------------------
 */

let requestSeq = 0;
function makeRequestId() {
  requestSeq += 1;
  return `req_${Date.now()}_${requestSeq}`;
}

const PTT_REQUEST_TIMEOUT_MS = 4000;

export class PttSignalingClient {
  /** @param {string} url e.g. "ws://localhost:8787" */
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.roomId = null;
    this.userId = null;
    this._listeners = new Map(); // type -> Set<handler>
    this._pendingPttRequests = new Map(); // requestId -> {resolve}
    // Part 6 (Repeated Transmission Hotfix v0.3): a pending PTT request
    // should resolve immediately on connection loss, not sit waiting for
    // its own 4s timeout while the caller is already trying to clean up.
    this.on("socket_closed", () => this._rejectAllPendingPtt("connection_lost"));
    this.on("socket_error", () => this._rejectAllPendingPtt("connection_lost"));
  }

  _rejectAllPendingPtt(reason) {
    for (const { resolve } of this._pendingPttRequests.values()) {
      resolve({ type: "ptt_denied", reason });
    }
    this._pendingPttRequests.clear();
  }

  on(type, handler) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(handler);
    return () => this._listeners.get(type)?.delete(handler);
  }

  _emit(type, payload) {
    this._listeners.get(type)?.forEach((h) => h(payload));
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
      } catch (err) {
        reject(err);
        return;
      }
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => {
        this._emit("socket_error", {});
        reject(new Error("signaling_connect_failed"));
      };
      this.ws.onmessage = (ev) => this._handleMessage(ev.data);
      this.ws.onclose = () => this._emit("socket_closed", {});
    });
  }

  _handleMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (err) {
      return;
    }
    if (!msg || typeof msg.type !== "string") return;

    if ((msg.type === "ptt_granted" || msg.type === "ptt_denied") && msg.requestId) {
      const pending = this._pendingPttRequests.get(msg.requestId);
      if (pending) {
        this._pendingPttRequests.delete(msg.requestId);
        pending.resolve(msg);
      }
    }

    this._emit(msg.type, msg);
  }

  _send(msg) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  join(roomId, userId, displayName, deviceSessionId) {
    this.roomId = roomId;
    this.userId = userId;
    this._send({ type: "room_join", roomId, userId, displayName, deviceSessionId });
  }

  /** @returns {Promise<{type: "ptt_granted"} | {type: "ptt_denied", reason: string}>} */
  requestPtt(targetUserIds) {
    const requestId = makeRequestId();
    return new Promise((resolve) => {
      this._pendingPttRequests.set(requestId, { resolve });
      const sent = this._send({
        type: "ptt_request",
        roomId: this.roomId,
        senderUserId: this.userId,
        targetUserIds,
        requestId,
      });
      if (!sent) {
        this._pendingPttRequests.delete(requestId);
        resolve({ type: "ptt_denied", reason: "not_connected" });
        return;
      }
      setTimeout(() => {
        if (this._pendingPttRequests.has(requestId)) {
          this._pendingPttRequests.delete(requestId);
          resolve({ type: "ptt_denied", reason: "timeout" });
        }
      }, PTT_REQUEST_TIMEOUT_MS);
    });
  }

  releasePtt() {
    this._send({ type: "ptt_release", roomId: this.roomId, senderUserId: this.userId, requestId: makeRequestId() });
  }

  sendOffer(targetUserId, sdp) {
    this._send({ type: "offer", roomId: this.roomId, senderUserId: this.userId, targetUserId, sdp });
  }

  sendAnswer(targetUserId, sdp) {
    this._send({ type: "answer", roomId: this.roomId, senderUserId: this.userId, targetUserId, sdp });
  }

  sendIceCandidate(targetUserId, candidate) {
    this._send({ type: "ice_candidate", roomId: this.roomId, senderUserId: this.userId, targetUserId, candidate });
  }

  sendConnectionState(state) {
    this._send({ type: "connection_state", roomId: this.roomId, senderUserId: this.userId, state });
  }

  /** Runtime Identity v0.4 §9 — Host-only, server-validated against the
   * socket's bound identity (never trusts a claimed senderUserId). */
  sendRoundStart({ roundId, courseSnapshot, startHole, startedAt, players }) {
    this._send({
      type: "round_start_request",
      roomId: this.roomId,
      senderUserId: this.userId,
      roundId,
      courseSnapshot,
      startHole,
      startedAt,
      players,
    });
  }

  // RC1 Networking Recovery — distance sharing was never sent over the
  // network at all before this; see DistanceCard.jsx/NetworkPttClient.js.
  // P0-5 fix — cheer/sound effects were never sent over the network at all.
  // RC4 P1 defense — rejoin hole-state recovery.
  sendHoleSync({ currentHoleNumber, targetUserId }) {
    this._send({ type: "hole_sync", roomId: this.roomId, currentHoleNumber, targetUserId });
  }

  // RC4 P1 fix — hole progression was never sent over the network at all.
  sendHoleAdvance({ completedHoleNumber, nextHoleNumber }) {
    this._send({ type: "hole_advance", roomId: this.roomId, completedHoleNumber, nextHoleNumber });
  }

  sendSoundPlayed({ soundId, category, label, targetUserIds }) {
    this._send({ type: "sound_played", roomId: this.roomId, soundId, category, label, targetUserIds });
  }

  sendDistanceShare({ referenceDistanceM, source, holeNumber }) {
    this._send({
      type: "distance_share",
      roomId: this.roomId,
      referencePlayerId: this.userId,
      referenceDistanceM,
      source,
      holeNumber,
    });
  }

  close() {
    this.ws?.close();
  }
}
