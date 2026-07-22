/**
 * activeRoomRef.js
 * ------------------------------------------------------------------
 * RC4 Session Recovery — the MINIMUM recovery data for returning to an
 * active round after an interruption (app termination, phone call, OS
 * background suspension, dev reload, temporary network loss).
 *
 * DELIBERATELY NOT stored here: the live participant roster and the live
 * round snapshot. Persisting old room.members was exactly the earlier bug
 * where stale members showed up as current participants. The server is
 * the source of truth for live roster + round state; on [계속하기] we
 * rejoin and rebuild those from the server (room_joined / round_started).
 *
 * What we persist is only enough to OFFER a rejoin and to perform it with
 * the same identity:
 *   - roomId       (== Room.code, what the signaling server keys on)
 *   - userId       (stable identity — never changes on rejoin)
 *   - displayName  (for the Home "진행 중인 라운드" card)
 *   - role         ("host" | "member") if relevant to the rejoin
 *   - roundId      (active round/session identifier)
 *   - lastHole     (last known current hole, display-only hint)
 *   - updatedAt    (last known timestamp)
 *
 * This is separate from nickname persistence (identityStorage.js) and
 * from the old full-room persistence (roomStorage.js, no longer used for
 * startup restore).
 * ------------------------------------------------------------------
 */

export const ACTIVE_ROOM_REF_KEY = "fieldtalk.activeRoomRef.v1";

function isValidRef(ref) {
  return (
    ref &&
    typeof ref === "object" &&
    typeof ref.roomId === "string" &&
    ref.roomId.length > 0 &&
    typeof ref.userId === "string" &&
    ref.userId.length > 0
  );
}

export function loadActiveRoomRef() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(ACTIVE_ROOM_REF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isValidRef(parsed) ? parsed : null;
  } catch (err) {
    return null;
  }
}

/**
 * Persist (or update) the active-room reference. Merges onto any existing
 * ref so a partial update (e.g. just a new lastHole) doesn't drop other
 * fields. Refuses to write an invalid ref (missing roomId/userId).
 */
export function saveActiveRoomRef(patch) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    const existing = loadActiveRoomRef() ?? {};
    const next = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    if (!isValidRef(next)) return;
    window.localStorage.setItem(ACTIVE_ROOM_REF_KEY, JSON.stringify(next));
  } catch (err) {
    /* storage full/disabled — fail silently, same policy as other stores */
  }
}

export function clearActiveRoomRef() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.removeItem(ACTIVE_ROOM_REF_KEY);
  } catch (err) {
    /* ignore */
  }
}
