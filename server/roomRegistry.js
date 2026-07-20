/**
 * roomRegistry.js
 * ------------------------------------------------------------------
 * Two Device PTT Foundation v0.1 §11, Runtime Identity v0.4 §9/§14 —
 * server-side room/connection bookkeeping. Deliberately separate from
 * the CLIENT-side Room Engine (src/room/roomReducer.js) — this only
 * tracks "who is connected to which room over which WebSocket, and who
 * is host", not join-status/PTT-test/course selection state, which stays
 * entirely client-side per the existing architecture boundary.
 *
 * v0.4: now also tracks `hostUserId` per room (the first member to join
 * — matching the client-side Room Engine's "room creator is host"
 * concept) so the server can authorize `round_start` (§9/§14: "Host만
 * round_start 가능").
 * ------------------------------------------------------------------
 */

export class RoomRegistry {
  constructor() {
    /** roomId -> { members: Map<userId, {ws, displayName, deviceSessionId}>, hostUserId: string|null } */
    this.rooms = new Map();
  }

  _getOrCreateRoom(roomId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, { members: new Map(), hostUserId: null });
    }
    return this.rooms.get(roomId);
  }

  /** §5 (v0.1): "동일 userId의 중복 세션 정책은 이번에 단순화" — a second
   * connection for the same userId simply replaces the first one's
   * registry entry (last-connected-wins for routing purposes). The old
   * socket is not forcibly closed here — the caller may choose to.
   * §9 (v0.4): the FIRST member to ever join a room becomes its host —
   * a later reconnect of that same userId does not change who's host. */
  addMember(roomId, userId, ws, { displayName, deviceSessionId }) {
    const room = this._getOrCreateRoom(roomId);
    const previous = room.members.get(userId) ?? null;
    room.members.set(userId, { ws, displayName, deviceSessionId });
    if (!room.hostUserId) room.hostUserId = userId;
    return { previous, hostUserId: room.hostUserId };
  }

  removeMember(roomId, userId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.members.delete(userId);
    if (room.members.size === 0) this.rooms.delete(roomId);
  }

  /** Finds and removes whichever (roomId, userId) this socket was
   * registered under — used on socket close, when the server doesn't
   * already know which room/user it was. */
  removeConnection(ws) {
    for (const [roomId, room] of this.rooms.entries()) {
      for (const [userId, member] of room.members.entries()) {
        if (member.ws === ws) {
          this.removeMember(roomId, userId);
          return { roomId, userId };
        }
      }
    }
    return null;
  }

  getMembers(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return Array.from(room.members.entries()).map(([userId, m]) => ({
      userId,
      displayName: m.displayName,
      deviceSessionId: m.deviceSessionId,
    }));
  }

  isMember(roomId, userId) {
    return this.rooms.get(roomId)?.members.has(userId) ?? false;
  }

  getHostUserId(roomId) {
    return this.rooms.get(roomId)?.hostUserId ?? null;
  }

  isHost(roomId, userId) {
    return this.getHostUserId(roomId) === userId;
  }

  getSocket(roomId, userId) {
    return this.rooms.get(roomId)?.members.get(userId)?.ws ?? null;
  }

  sendTo(roomId, userId, message) {
    const ws = this.getSocket(roomId, userId);
    if (!ws) return false;
    ws.send(JSON.stringify(message));
    return true;
  }

  broadcast(roomId, message, excludeUserId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    for (const [userId, member] of room.members.entries()) {
      if (userId === excludeUserId) continue;
      member.ws.send(JSON.stringify(message));
    }
  }
}
