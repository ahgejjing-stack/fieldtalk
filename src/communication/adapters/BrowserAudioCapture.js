/**
 * BrowserAudioCapture.js
 * ------------------------------------------------------------------
 * Local Media Capture Prototype v0.1 §3/§9 — the concrete AudioCapture
 * implementation. This is the ONLY file in the app that calls
 * getUserMedia/AudioContext/AnalyserNode directly — PTTButton.jsx,
 * VoiceLevelBars.jsx, and everything above LocalPttClient stay unaware
 * of these APIs (§10: no MediaStream/AudioContext/AnalyserNode/
 * getUserMedia terms ever reach user-facing UI).
 *
 * Hard requirements this file enforces:
 *   - Never connects the analyser (or anything) to audioCtx.destination —
 *     no loopback playback of the user's own voice (§3: feedback/howling
 *     risk).
 *   - No MediaRecorder, no Blob, no file/localStorage/network write of
 *     any captured audio (§3 explicit prohibition list).
 * ------------------------------------------------------------------
 */
import { AudioCapture } from "../AudioCapture.js";

// Exponential smoothing factor for getLevel() — reduces frame-to-frame
// jitter without needing a rolling buffer. Lower = smoother/slower to
// react; tuned empirically against a synthetic test tone (see
// LocalPttClient.test.js) to still feel responsive within ~2-3 frames.
const LEVEL_SMOOTHING = 0.35;
// RMS values from real speech rarely approach 1.0 on this waveform-based
// measure; scale up so normal talking volume reaches a usable range on a
// 0..1 meter instead of staying near the bottom third.
const LEVEL_SCALE = 4;

export class BrowserAudioCapture extends AudioCapture {
  constructor() {
    super();
    this.stream = null;
    this.audioCtx = null;
    this.sourceNode = null;
    this.analyser = null;
    this.dataArray = null;
    this.smoothedLevel = 0;
    this._lastRawLevel = 0;
  }

  async acquire() {
    if (this.stream) return; // already warm — idempotent, see AudioCapture.js contract

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("getUserMedia_unsupported");
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const track = this.stream.getAudioTracks()[0];
    if (!track) {
      this.release();
      throw new Error("no_audio_track");
    }
    // Starts disabled — acquiring the mic (e.g. during Pre-Round PTT Test
    // "마이크 준비") must never itself start capturing; only setActive(true)
    // (driven by an actual PTT press) does that.
    track.enabled = false;

    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      this.release();
      throw new Error("audio_context_unsupported");
    }
    this.audioCtx = new Ctx();
    // §9: autoplay policy — by the time acquire() runs we're already
    // inside a user-gesture-triggered handler (PTT press or the Pre-Round
    // "마이크 준비" button tap), so resume() here is expected to succeed
    // synchronously with that gesture's permission, not a bare page-load.
    if (this.audioCtx.state === "suspended") {
      await this.audioCtx.resume();
    }

    this.sourceNode = this.audioCtx.createMediaStreamSource(this.stream);
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.6;
    this.sourceNode.connect(this.analyser);
    // Deliberately NOT connected onward to this.audioCtx.destination — no
    // loopback playback of the user's own mic (§3 hard requirement).
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
  }

  setActive(active) {
    const track = this.stream?.getAudioTracks()[0];
    if (track) track.enabled = active;
    if (!active) {
      this.smoothedLevel = 0;
      this._lastRawLevel = 0;
    }
  }

  getLevel() {
    if (!this.analyser || !this.dataArray) return 0;
    this.analyser.getByteTimeDomainData(this.dataArray);
    let sumSquares = 0;
    for (let i = 0; i < this.dataArray.length; i += 1) {
      const v = (this.dataArray[i] - 128) / 128;
      sumSquares += v * v;
    }
    const rms = Math.sqrt(sumSquares / this.dataArray.length);
    const raw = Math.min(1, rms * LEVEL_SCALE);
    this._lastRawLevel = raw;
    this.smoothedLevel += (raw - this.smoothedLevel) * LEVEL_SMOOTHING;
    return this.smoothedLevel;
  }

  /** Unsmoothed reading from the same analyser pass getLevel() just ran —
   * §5 DEV visibility only, never used for any gating decision. Call
   * getLevel() first each frame; this just returns what it last computed. */
  getRawLevel() {
    return this._lastRawLevel ?? 0;
  }

  release() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    this.dataArray = null;
    this.smoothedLevel = 0;
    this._lastRawLevel = 0;
  }
}
