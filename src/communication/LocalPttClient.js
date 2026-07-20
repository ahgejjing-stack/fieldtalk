/**
 * LocalPttClient.js
 * ------------------------------------------------------------------
 * Local Media Capture Prototype v0.1 §1/§2/§5/§7 — the Phase 1
 * implementation of PttClient. Controls a real microphone via an
 * AudioCapture instance (BrowserAudioCapture in production); does NOT
 * send anything over a network. requestTransmit()/stopTransmit() only
 * ever turn the local track on/off and read its input level.
 *
 * §7 stream lifecycle modes (constructor option, DEV-comparable):
 *   - "warm" (default, recommended — see docs/... 결과 보고): acquire()
 *     happens once (e.g. at Pre-Round PTT Test "마이크 준비", or on first
 *     transmit if never explicitly prepared), then every subsequent
 *     transmit just flips track.enabled. release() only happens on
 *     unmount/Room-Round exit or explicit releaseMicrophone().
 *   - "cold": every stopTransmit() also fully release()s the capture, so
 *     the next requestTransmit() re-acquires (fresh getUserMedia) from
 *     scratch. Exists so the two policies can be measured side by side
 *     (see LocalPttClient.test.js and the Sprint's Warm/Cold comparison).
 * ------------------------------------------------------------------
 */
import { PttClient } from "./PttClient.js";
import { COMMUNICATION_STATES } from "./communicationState.js";

// §5 — "voice detected" is a purely visual threshold for VoiceLevelBars'
// three-tier display; it never gates whether transmission happens (no VAD
// in this Sprint's scope).
const VOICE_DETECTED_THRESHOLD = 0.06;

export class LocalPttClient extends PttClient {
  /**
   * @param {import("./AudioCapture.js").AudioCapture} audioCapture
   * @param {{streamLifecycle?: "warm" | "cold"}} [options]
   */
  constructor(audioCapture, options = {}) {
    super();
    this.audioCapture = audioCapture;
    this.streamLifecycle = options.streamLifecycle ?? "warm";
    this.state = {
      status: COMMUNICATION_STATES.IDLE,
      permissionStatus: "prompt", // "prompt" | "granted" | "denied"
      inputLevel: 0,
      rawInputLevel: 0,
      voiceDetected: false,
      isTesting: false,
      lastError: null,
    };
    this.listeners = new Set();
    this._levelRaf = null;
    this._preparePromise = null; // in-flight prepare(), so concurrent calls share one attempt
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

  async prepare() {
    if (this.state.status === COMMUNICATION_STATES.READY || this.state.status === COMMUNICATION_STATES.TRANSMITTING) {
      return { ok: true };
    }
    if (this._preparePromise) return this._preparePromise; // §12 test 6: concurrent prepare() calls are safe

    this._preparePromise = (async () => {
      this._setState({ status: COMMUNICATION_STATES.PREPARING, lastError: null });
      try {
        await this.audioCapture.acquire();
        this._setState({ status: COMMUNICATION_STATES.READY, permissionStatus: "granted", lastError: null });
        return { ok: true };
      } catch (err) {
        const message = err?.message ?? String(err);
        const denied = err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError";
        this._setState({
          status: denied ? COMMUNICATION_STATES.PERMISSION_DENIED : COMMUNICATION_STATES.UNAVAILABLE,
          permissionStatus: denied ? "denied" : this.state.permissionStatus,
          lastError: message,
        });
        return { ok: false, reason: denied ? "permission_denied" : "unavailable" };
      } finally {
        this._preparePromise = null;
      }
    })();

    return this._preparePromise;
  }

  async requestTransmit(targetUserIds) {
    // §5/§12 test 2: no target, no microphone activation at all.
    if (!targetUserIds || targetUserIds.length === 0) {
      return { ok: false, reason: "no_target" };
    }
    if (this.state.status === COMMUNICATION_STATES.TRANSMITTING) {
      return { ok: true }; // §12 test 6: already transmitting, no-op success
    }

    // §5 "Round PTT 폴백": not prepared yet (or cold mode after a previous
    // release) — try once, inline.
    if (this.state.status !== COMMUNICATION_STATES.READY) {
      const prepared = await this.prepare();
      if (!prepared.ok) return prepared; // §12 test 3: mic failure never reaches transmitting
    }

    this.audioCapture.setActive(true);
    this._setState({ status: COMMUNICATION_STATES.TRANSMITTING, inputLevel: 0, rawInputLevel: 0, voiceDetected: false });
    this._startLevelLoop();
    return { ok: true };
  }

  stopTransmit() {
    if (this.state.status !== COMMUNICATION_STATES.TRANSMITTING) return; // §12 test 6: safe to call twice

    this.audioCapture.setActive(false);
    this._stopLevelLoop();

    if (this.streamLifecycle === "cold") {
      this.audioCapture.release();
      this._setState({ status: COMMUNICATION_STATES.IDLE, permissionStatus: this.state.permissionStatus, inputLevel: 0, rawInputLevel: 0, voiceDetected: false });
    } else {
      this._setState({ status: COMMUNICATION_STATES.READY, inputLevel: 0, rawInputLevel: 0, voiceDetected: false });
    }
  }

  /**
   * Real Round UX Audit v1.0 §1 — "마이크 준비 + PTT 테스트 통합". A
   * press-and-hold self-check: requests the mic if needed, then
   * activates the SAME local track for real level feedback, but never
   * touches the server PTT lock, targets, or Round Engine — this is a
   * private, local-only diagnostic, not a transmission to anyone.
   * Distinct from requestTransmit()/status so it can never be confused
   * with — or interrupt — a real PTT press. */
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

  release() {
    this._stopLevelLoop();
    this.audioCapture.release();
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
        voiceDetected: rawLevel > VOICE_DETECTED_THRESHOLD,
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
