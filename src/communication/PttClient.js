/**
 * PttClient.js
 * ------------------------------------------------------------------
 * Local Media Capture Prototype v0.1 §1 — the interface CommunicationProvider
 * talks to. LocalPttClient (this Sprint) implements it with no network;
 * a future NetworkPttClient (docs/REAL_PTT_ARCHITECTURE_v1.md Phase 2+)
 * implements the exact same shape with a real transport underneath —
 * CommunicationProvider, PTTButton.jsx, and VoiceLevelBars.jsx never need
 * to change when that swap happens.
 * ------------------------------------------------------------------
 */
export class PttClient {
  /** Acquires whatever's needed to be ready to transmit (microphone for
   * Local; microphone + signaling handshake for Network, later). Safe to
   * call when already prepared. @returns {Promise<{ok: boolean, reason?: string}>} */
  async prepare() {
    throw new Error("PttClient.prepare() not implemented");
  }

  /** @param {string[]} targetUserIds
   * @returns {Promise<{ok: boolean, reason?: string}>} */
  // eslint-disable-next-line no-unused-vars
  async requestTransmit(targetUserIds) {
    throw new Error("PttClient.requestTransmit() not implemented");
  }

  stopTransmit() {
    throw new Error("PttClient.stopTransmit() not implemented");
  }

  /** Full teardown — releases the microphone (and, later, any network
   * session). */
  release() {
    throw new Error("PttClient.release() not implemented");
  }

  /** @returns {{status: string, permissionStatus: string, inputLevel: number, lastError: string|null}} */
  getState() {
    throw new Error("PttClient.getState() not implemented");
  }

  /** @param {(state: object) => void} listener
   * @returns {() => void} unsubscribe function */
  // eslint-disable-next-line no-unused-vars
  subscribe(listener) {
    throw new Error("PttClient.subscribe() not implemented");
  }
}
