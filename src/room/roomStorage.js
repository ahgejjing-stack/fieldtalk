/**
 * roomStorage.js
 * ------------------------------------------------------------------
 * Round Room Foundation v0.1 §10 — Room persistence lives in its own
 * file and its own localStorage key, deliberately separate from
 * roundStorage.js. "Room과 Round는 수명이 다르다" — Room is Session-scoped
 * (this Sprint only persists the *active* room, no history), Round is a
 * Permanent/History candidate (already handled by roundStorage.js,
 * untouched here).
 * ------------------------------------------------------------------
 */

export const ROOM_STORAGE_KEY = "fieldtalk.room.active.v1";

// Runtime Identity v0.4 §12 — same rationale as roundStorage.js: default
// identity keeps the original key, other identities get a namespaced one.
import { DEFAULT_IDENTITY_USER_ID } from "../identity/runtimeIdentity.js";
function resolveRoomStorageKey(userId) {
  if (!userId || userId === DEFAULT_IDENTITY_USER_ID) return ROOM_STORAGE_KEY;
  return `${ROOM_STORAGE_KEY}:${userId}`;
}

function looksLikeRoomState(parsed) {
  return parsed && typeof parsed === "object" && ("room" in parsed);
}

export function loadRoomState(userId) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(resolveRoomStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!looksLikeRoomState(parsed)) return null;
    return parsed;
  } catch (err) {
    // Corrupted JSON or anything unexpected — caller falls back to empty.
    return null;
  }
}

export function saveRoomState(roomState, userId) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(resolveRoomStorageKey(userId), JSON.stringify(roomState));
  } catch (err) {
    // Storage full/disabled — fail silently, same policy as roundStorage.js.
  }
}

export function clearRoomState(userId) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.removeItem(resolveRoomStorageKey(userId));
  } catch (err) {
    /* ignore */
  }
}
