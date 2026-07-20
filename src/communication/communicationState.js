/**
 * communicationState.js
 * ------------------------------------------------------------------
 * Local Media Capture Prototype v0.1 §2 — the state names Phase 1
 * actually uses, plus the future network states reserved (as types/
 * documentation only, per the Sprint spec — "동작까지 구현하지 않아도
 * 됩니다") so PttClient's interface doesn't need to change shape when
 * Phase 2+ adds real network transmit-request/grant/deny.
 * ------------------------------------------------------------------
 */

/** Phase 1 — implemented and reachable this Sprint. */
export const COMMUNICATION_STATES = {
  IDLE: "idle",
  PREPARING: "preparing",
  READY: "ready",
  TRANSMITTING: "transmitting",
  PERMISSION_DENIED: "permission_denied",
  UNAVAILABLE: "unavailable",
  ERROR: "error",
};

/** Reserved for the future NetworkPttClient (Phase 2+, docs/REAL_PTT_ARCHITECTURE_v1.md
 * §3's PTT Client State). Not reachable from LocalPttClient this Sprint —
 * kept here only so the eventual network implementation doesn't need a
 * different state name set. */
export const RESERVED_NETWORK_STATES = {
  REQUESTING: "requesting",
  GRANTED: "granted",
  DENIED: "denied",
  RECONNECTING: "reconnecting",
  STOPPING: "stopping",
};
