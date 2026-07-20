/**
 * identityStorage.js
 * ------------------------------------------------------------------
 * Runtime Identity & Main-to-Main PTT Integration v0.4 §4 — storage
 * split rationale:
 *
 *   - userId/displayName -> localStorage. "새로고침 후 같은 탭/브라우저에서는
 *     identity 유지" — localStorage persists across reloads and even
 *     browser restarts for the SAME browser profile, which is exactly
 *     "this browser is 재식's browser" semantics for a Prototype without
 *     real login.
 *   - deviceSessionId -> sessionStorage. "다른 BrowserContext는 독립
 *     identity 가능" — sessionStorage is scoped per tab/context and never
 *     shared, even within the same browser profile, which is exactly
 *     "this specific tab's connection" semantics. Two Playwright
 *     BrowserContexts (or two real browser profiles) never share either
 *     storage, so they're independent by construction; two tabs in the
 *     SAME profile would share localStorage's userId (same person) but
 *     get their own sessionStorage deviceSessionId (different sessions)
 *     — see §13 Duplicate Session Policy for what the server does with
 *     two sessions claiming the same userId.
 * ------------------------------------------------------------------
 */

const IDENTITY_KEY = "fieldtalk.identity.v1";
const DEVICE_SESSION_KEY = "fieldtalk.deviceSession.v1";

export function loadIdentity() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.userId || !parsed?.displayName) return null;
    return parsed;
  } catch (err) {
    return null;
  }
}

export function saveIdentity({ userId, displayName }) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(IDENTITY_KEY, JSON.stringify({ userId, displayName }));
  } catch (err) {
    /* ignore */
  }
}

export function loadOrCreateDeviceSessionId(makeId) {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return makeId();
    const existing = window.sessionStorage.getItem(DEVICE_SESSION_KEY);
    if (existing) return existing;
    const created = makeId();
    window.sessionStorage.setItem(DEVICE_SESSION_KEY, created);
    return created;
  } catch (err) {
    return makeId();
  }
}

/** §12 Persistence and Migration — clears any localStorage/sessionStorage
 * entries namespaced to a DIFFERENT identity than the one about to become
 * active, so switching identity in the same browser (DEV testing) never
 * mixes one person's Room/Round state into another's. See
 * roomStorage.js/roundStorage.js's namespaced-key helpers, which this
 * calls into. */
export function clearDeviceSessionForNewIdentity() {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return;
    window.sessionStorage.removeItem(DEVICE_SESSION_KEY);
  } catch (err) {
    /* ignore */
  }
}
