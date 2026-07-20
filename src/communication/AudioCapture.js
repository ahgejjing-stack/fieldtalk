/**
 * AudioCapture.js
 * ------------------------------------------------------------------
 * Local Media Capture Prototype v0.1 §1/§3 — the contract standing
 * between LocalPttClient (which only knows "prepare/activate/read level/
 * release") and whatever actually talks to the browser's microphone
 * (BrowserAudioCapture, in adapters/). Same abstract-base pattern already
 * used for CourseReferenceProvider and LocationProvider.
 * ------------------------------------------------------------------
 */
export class AudioCapture {
  /** Acquires the microphone (getUserMedia) and sets up whatever's needed
   * to read an input level later. Must be safe to call again while
   * already acquired (idempotent) — LocalPttClient's warm-mode reuse
   * depends on this. Track starts DISABLED; activate() is what turns it
   * on. Throws on permission denial or hardware unavailability — the
   * caller (LocalPttClient) is responsible for turning that into a
   * COMMUNICATION_STATES.PERMISSION_DENIED / UNAVAILABLE transition. */
  async acquire() {
    throw new Error("AudioCapture.acquire() not implemented");
  }

  /** Turns the already-acquired microphone track on/off without
   * re-requesting permission or re-acquiring the stream. */
  // eslint-disable-next-line no-unused-vars
  setActive(active) {
    throw new Error("AudioCapture.setActive() not implemented");
  }

  /** @returns {number} 0.0–1.0 current input level. 0 when not acquired,
   * not active, or silent — never fabricated. */
  getLevel() {
    throw new Error("AudioCapture.getLevel() not implemented");
  }

  /** @returns {number} 0.0–1.0 the unsmoothed reading behind the last
   * getLevel() call — Sprint v0.2 §5 DEV visibility only, never used for
   * any gating decision. */
  getRawLevel() {
    throw new Error("AudioCapture.getRawLevel() not implemented");
  }

  /** Full teardown: stops all tracks, closes any audio processing
   * context, disconnects nodes. Safe to call even if never acquired. */
  release() {
    throw new Error("AudioCapture.release() not implemented");
  }
}
