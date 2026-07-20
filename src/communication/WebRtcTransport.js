/**
 * WebRtcTransport.js
 * ------------------------------------------------------------------
 * Two Device PTT Foundation v0.1 §2/§7, Bidirectional Hardening v0.2
 * Part C — wraps one RTCPeerConnection to one remote peer.
 *
 * Part C ICE candidate queue: a candidate arriving before
 * setRemoteDescription() has completed is NOT silently dropped anymore.
 * It's queued and applied in order once the remote description is set.
 * "candidate 손실을 정상 동작으로 간주하지 마세요" — this file no longer
 * has a bare catch-and-ignore around addIceCandidate.
 *
 * The local audio track is added to the connection immediately (§7 "권한
 * 준비를 위해 stream을 warm 상태로 보유할 수는 있지만, audio track은
 * granted 이후에만 활성화") with `track.enabled = false` — the same
 * warm-mode pattern LocalPttClient already uses.
 * ------------------------------------------------------------------
 */

export class WebRtcTransport {
  /**
   * @param {{
   *   iceServers: RTCIceServer[],
   *   onIceCandidate: (candidate: RTCIceCandidate) => void,
   *   onRemoteTrack: (stream: MediaStream) => void,
   *   onConnectionStateChange: (state: string) => void,
   *   onTrackEnded: () => void,
   * }} handlers
   */
  constructor({ iceServers = [], onIceCandidate, onRemoteTrack, onConnectionStateChange, onTrackEnded }) {
    this.pc = new RTCPeerConnection({ iceServers });
    this._hasRemoteDescription = false;
    this._pendingCandidates = [];
    this._closed = false;

    this.pc.onicecandidate = (event) => {
      if (event.candidate) onIceCandidate(event.candidate);
    };
    this.pc.ontrack = (event) => {
      onRemoteTrack(event.streams[0]);
      // Part F: "remote track ended 시 receiving false" — a remote peer
      // stopping their track (not just the whole connection dropping)
      // must also trigger cleanup.
      event.track.onended = () => onTrackEnded?.();
    };
    // Part B: connectionState covers the whole PeerConnection lifecycle
    // (new/connecting/connected/disconnected/failed/closed) — the single
    // signal NetworkPttClient's unified cleanup path listens to.
    this.pc.onconnectionstatechange = () => {
      onConnectionStateChange(this.pc.connectionState);
    };
  }

  /** Adds the local mic track (from BrowserAudioCapture's stream) to this
   * connection. Safe to call once per transport instance — this
   * Prototype doesn't renegotiate tracks mid-call. */
  addLocalTrack(track, stream) {
    this.pc.addTrack(track, stream);
  }

  async createOffer() {
    const offer = await this.pc.createOffer({ offerToReceiveAudio: true });
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async createAnswerFor(remoteOffer) {
    await this.pc.setRemoteDescription(remoteOffer);
    await this._flushPendingCandidates();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async setRemoteAnswer(answer) {
    await this.pc.setRemoteDescription(answer);
    await this._flushPendingCandidates();
  }

  /** Part C: queue if remoteDescription isn't set yet, otherwise apply
   * immediately. Never silently drops a candidate. */
  async addIceCandidate(candidate) {
    if (!this._hasRemoteDescription) {
      this._pendingCandidates.push(candidate);
      return { queued: true };
    }
    return this._applyCandidate(candidate);
  }

  async _applyCandidate(candidate) {
    try {
      await this.pc.addIceCandidate(candidate);
      return { applied: true };
    } catch (err) {
      // A genuine application failure (malformed candidate, etc.) is
      // recorded, not silently swallowed — the caller can inspect
      // `lastCandidateError` for diagnostics (§ Part C "적용 실패 시
      // reason 기록").
      this.lastCandidateError = err?.message ?? String(err);
      return { applied: false, reason: this.lastCandidateError };
    }
  }

  async _flushPendingCandidates() {
    this._hasRemoteDescription = true;
    const queued = this._pendingCandidates;
    this._pendingCandidates = [];
    for (const candidate of queued) {
      // eslint-disable-next-line no-await-in-loop
      await this._applyCandidate(candidate);
    }
  }

  get connectionState() {
    return this.pc.connectionState;
  }

  close() {
    if (this._closed) return; // Part B: cleanup must be safe to call repeatedly
    this._closed = true;
    this._pendingCandidates = []; // Part C: "transport close 시 queue 정리"
    this.pc.close();
  }
}
