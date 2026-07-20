/**
 * PttPressController.js
 * ------------------------------------------------------------------
 * Local Media Capture Stabilization v0.2 §1/§2 — coordinates the async
 * press race condition. PTTButton.jsx's handleStart() awaits
 * communication.startTransmit(), which can take an arbitrary amount of
 * time (permission prompt, device acquisition). By the time it resolves,
 * the user may have already released the button, pressed again, or the
 * component may have unmounted. This class is the single source of truth
 * for "is it still valid to commit to transmitting right now."
 *
 * Deliberately plain JS, not a React hook — testable directly in Node
 * (see PttPressController.test.js) without a component-testing library,
 * matching this project's established no-framework test pattern.
 *
 * §2 Cancellation Contract: this does NOT attempt to physically cancel an
 * in-flight getUserMedia call (the Sprint spec explicitly notes
 * AbortController can't do that reliably). Instead, it makes late/stale
 * results unable to affect anything — "늦게 도착한 성공 결과가 송신
 * 상태로 진입하지 못하게 하는 것".
 *
 * Serialization: startTransmit() is genuinely a single shared client call
 * (LocalPttClient instance), so two overlapping in-flight calls could
 * race against EACH OTHER's completion handlers, not just against the
 * user's pointer state. `runExclusive()` guarantees at most one attempt
 * is ever in flight; a press that arrives while one is pending doesn't
 * issue a second concurrent call — it just updates the press state, and
 * the in-flight attempt's completion handler retries for the newest
 * generation if the user is still holding when it finishes.
 * ------------------------------------------------------------------
 */
export class PttPressController {
  constructor() {
    this.pointerHeld = false;
    this.mounted = true;
    this.generation = 0;
    this._requestInFlight = false;
  }

  setMounted(value) {
    this.mounted = value;
  }

  /** Call on pointerdown. Returns this press's generation token. */
  beginPress() {
    this.pointerHeld = true;
    this.generation += 1;
    return this.generation;
  }

  /** Call on pointerup/pointerleave/pointercancel. */
  endPress() {
    this.pointerHeld = false;
  }

  /** True only if: still mounted, pointer still physically held, AND no
   * newer press has started since `generation` was issued. */
  isStillValid(generation) {
    return this.mounted && this.pointerHeld && this.generation === generation;
  }

  get isRequestInFlight() {
    return this._requestInFlight;
  }

  /**
   * Runs `attemptFn(generation)` — expected to be an async function that
   * performs the actual transmit attempt and returns
   * `{ committed: boolean }` (true if it ended up calling startPtt() and
   * marking itself as the live transmission). If a press arrives while a
   * previous attempt is still in flight, this method returns immediately
   * without starting a second concurrent attempt; the in-flight attempt's
   * own retry logic (below) picks up the newer generation once it
   * settles.
   *
   * @param {number} generation
   * @param {(generation: number) => Promise<{committed: boolean}>} attemptFn
   */
  async runExclusive(generation, attemptFn) {
    if (this._requestInFlight) return; // a previous attempt is handling this; it will retry if needed
    this._requestInFlight = true;
    try {
      let currentGeneration = generation;
      // Loop instead of recursion so a chain of superseded presses can't
      // grow the call stack.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        await attemptFn(currentGeneration);
        // If, by the time that attempt settled, a newer press is still
        // being held, retry for that generation. Otherwise we're done.
        if (this.pointerHeld && this.mounted && this.generation !== currentGeneration) {
          currentGeneration = this.generation;
          continue;
        }
        break;
      }
    } finally {
      this._requestInFlight = false;
    }
  }
}
