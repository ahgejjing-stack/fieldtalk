/**
 * runtimeIdentity.js
 * ------------------------------------------------------------------
 * Runtime Identity & Main-to-Main PTT Integration v0.4 §2 — the minimal
 * RuntimeIdentity model. No login system — this is a Prototype-level
 * "who is this browser tab" concept, replacing the single hardcoded
 * `ME_PLAYER_ID` constant that assumed every tab was always 재식.
 *
 * RuntimeIdentity { userId, displayName, deviceSessionId }
 *   - userId: identifies the same person across Room/Round/PTT.
 *   - displayName: shown in UI.
 *   - deviceSessionId: this browser tab/session, NOT a Player/Room
 *     identity — never used as RoomMember.userId or RoundPlayer.id.
 * ------------------------------------------------------------------
 */

export const DEMO_IDENTITIES = [
  { userId: "player_jaesik", displayName: "재식" },
  { userId: "player_jaegeun", displayName: "재근" },
  { userId: "player_gwangcheon", displayName: "광천" },
  { userId: "player_haeran", displayName: "해란" },
];

export const DEFAULT_IDENTITY_USER_ID = "player_jaesik";

export function findDemoIdentity(userId) {
  return DEMO_IDENTITIES.find((id) => id.userId === userId) ?? DEMO_IDENTITIES[0];
}

export function makeDeviceSessionId(userId) {
  return `${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
