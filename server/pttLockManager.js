/**
 * pttLockManager.js
 * ------------------------------------------------------------------
 * Two Device PTT Foundation v0.1 §3 — the server-owned single-speaker
 * lock per room. This is exactly the "PTT lock authority" docs/
 * REAL_PTT_ARCHITECTURE_v1.md §6 recommended keeping on FIELDTALK's own
 * server (not a managed media service) so the single-speaker rule holds
 * regardless of what handles the actual media transport.
 *
 * Lease default: 60000ms (60s), matching docs/REAL_PTT_ARCHITECTURE_v1.md
 * §3's proposed lease value and its stated reasoning — "짧고 선택적인
 * 전달" (PTT is meant to be short), so a full-minute upper bound is
 * already generous, not a tight limit expected to bind in normal use.
 * Configurable via the constructor / PTT_LEASE_DURATION_MS env var (see
 * signalingServer.js), not hardcoded as a magic number callers can't
 * override.
 * ------------------------------------------------------------------
 */

export const DEFAULT_LEASE_DURATION_MS = 60000;

export class PttLockManager {
  /** @param {{leaseDurationMs?: number}} [options] */
  constructor({ leaseDurationMs = DEFAULT_LEASE_DURATION_MS } = {}) {
    this.leaseDurationMs = leaseDurationMs;
    /** roomId -> { currentSpeakerUserId, leaseExpiresAt, timer } */
    this.locks = new Map();
  }

  /**
   * @param {string} roomId
   * @param {string} userId
   * @returns {{granted: boolean, reason?: string}}
   */
  requestLock(roomId, userId) {
    const existing = this.locks.get(roomId);

    if (existing && existing.currentSpeakerUserId === userId) {
      // §3: "같은 사용자의 중복 요청은 idempotent 처리" — refresh the
      // lease rather than erroring, so a client that re-sends
      // ptt_request (e.g. after a brief reconnect) doesn't get denied by
      // its own still-held lock.
      this._refreshLease(roomId, userId);
      return { granted: true };
    }

    if (existing && existing.currentSpeakerUserId !== userId) {
      return { granted: false, reason: "room_locked" };
    }

    this._grant(roomId, userId);
    return { granted: true };
  }

  /** @returns {boolean} true if a lock was actually held and released by
   * this call (false if userId wasn't the current speaker — a stale or
   * spoofed release request is simply ignored, not an error state). */
  release(roomId, userId) {
    const existing = this.locks.get(roomId);
    if (!existing || existing.currentSpeakerUserId !== userId) return false;
    this._clear(roomId);
    return true;
  }

  /** For "연결 종료 시 자동 release" (§3) — releases unconditionally,
   * regardless of which userId held it, since the caller (signalingServer)
   * already knows the disconnecting user IS the one to check. */
  releaseIfHeldBy(roomId, userId) {
    return this.release(roomId, userId);
  }

  getCurrentSpeaker(roomId) {
    return this.locks.get(roomId)?.currentSpeakerUserId ?? null;
  }

  isLocked(roomId) {
    return this.locks.has(roomId);
  }

  _grant(roomId, userId) {
    this._clearTimer(roomId);
    const leaseExpiresAt = Date.now() + this.leaseDurationMs;
    const timer = setTimeout(() => this._onLeaseExpired(roomId, userId), this.leaseDurationMs);
    if (typeof timer.unref === "function") timer.unref(); // never keep the process alive on its own
    this.locks.set(roomId, { currentSpeakerUserId: userId, leaseExpiresAt, timer });
  }

  _refreshLease(roomId, userId) {
    this._grant(roomId, userId); // re-grant = fresh timer + fresh expiry, same speaker
  }

  _clear(roomId) {
    this._clearTimer(roomId);
    this.locks.delete(roomId);
  }

  _clearTimer(roomId) {
    const existing = this.locks.get(roomId);
    if (existing?.timer) clearTimeout(existing.timer);
  }

  _onLeaseExpired(roomId, userId) {
    const existing = this.locks.get(roomId);
    if (!existing || existing.currentSpeakerUserId !== userId) return; // already released/replaced
    this.locks.delete(roomId);
    this.onExpired?.(roomId, userId);
  }
}
