/**
 * communicationMode.js
 * ------------------------------------------------------------------
 * Two Device PTT Foundation v0.1 §4 — mirrors runtimeMode.js's pattern
 * exactly. "local" (default) is what the main app always uses — every
 * existing Room/Round PTT behavior is completely unaffected. "network"
 * is used only by the isolated Two Device test screen.
 * ------------------------------------------------------------------
 */
export const COMMUNICATION_MODES = {
  LOCAL: "local",
  NETWORK: "network",
};

export const DEFAULT_COMMUNICATION_MODE = COMMUNICATION_MODES.LOCAL;
