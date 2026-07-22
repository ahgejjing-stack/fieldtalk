/**
 * roomReducer.js
 * ------------------------------------------------------------------
 * Round Room Foundation v0.1 §1/§2/§7 — pure reducer for Room state,
 * completely separate from roundReducer.js. Initial state is
 * `{ room: null }` (no active room) until ROOM_CREATE.
 *
 * MVP member policy (§7): max 4 (host included), only `joined` members
 * ever become Round Players, `invited` doesn't block a start — it just
 * isn't included.
 * ------------------------------------------------------------------
 */
import {
  ROOM_CREATE,
  ROOM_JOIN_BY_CODE,
  ROOM_MEMBER_INVITE,
  ROOM_MEMBER_JOIN,
  ROOM_MEMBER_DECLINE,
  ROOM_MEMBER_LEAVE,
  ROOM_MEMBER_SET_CONNECTION_STATUS,
  ROOM_MEMBER_SET_PTT_TEST_STATUS,
  ROOM_MARK_IN_ROUND,
  ROOM_SET_HOST,
  ROOM_RESET,
} from "./roomActions.js";

export const MAX_ROOM_MEMBERS = 4;

const nowIso = () => new Date().toISOString();

function generateRoomCode() {
  // Short, human-readable — not cryptographically meaningful, this is a
  // local prototype with no real invite transport (§ 구현하지 않음: 초대
  // 링크/QR). Just needs to look like a real room code in the UI.
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i += 1) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function createEmptyRoomState() {
  return { room: null };
}

function updateMember(members, userId, patch) {
  return members.map((m) => (m.userId === userId ? { ...m, ...patch } : m));
}

export function roomReducer(state, action) {
  switch (action.type) {
    case ROOM_CREATE: {
      const { hostUserId, hostDisplayName } = action.payload;
      return {
        ...state,
        room: {
          id: `room_${Date.now()}`,
          code: generateRoomCode(),
          status: "preparing",
          hostUserId,
          members: [
            {
              userId: hostUserId,
              displayName: hostDisplayName,
              role: "host",
              joinStatus: "joined", // a host doesn't invite themselves
              connectionStatus: "online",
              pttTestStatus: "not_tested",
              joinedAt: nowIso(),
            },
          ],
          createdAt: nowIso(),
          updatedAt: nowIso(),
        },
      };
    }

    case ROOM_JOIN_BY_CODE: {
      const { code, userId, displayName } = action.payload;
      return {
        ...state,
        room: {
          id: `room_${Date.now()}`,
          code,
          status: "preparing",
          hostUserId: null, // unknown locally — the signaling server (§7 source of truth in Network mode) knows the real host
          members: [
            {
              userId,
              displayName,
              role: "member",
              joinStatus: "joined",
              connectionStatus: "online",
              pttTestStatus: "not_tested",
              joinedAt: nowIso(),
            },
          ],
          createdAt: nowIso(),
          updatedAt: nowIso(),
        },
      };
    }

    case ROOM_MEMBER_INVITE: {
      if (!state.room) return state;
      const { userId, displayName } = action.payload;
      const existing = state.room.members.find((m) => m.userId === userId);
      // Sprint 8.3 Root Cause Fix: only an ACTIVE participant (still invited
      // or already joined) makes re-inviting a real no-op. Someone who left
      // or declined is not currently a participant — inviting them again is
      // a normal, expected action (this is exactly the 4th tap of the
      // 미초대→초대됨→참여함→미초대→(다시 초대됨) cycle), not a duplicate.
      const isActiveParticipant = existing && existing.joinStatus !== "left" && existing.joinStatus !== "declined";
      if (isActiveParticipant) return state;
      // §7 MVP: 최대 4명(Host 포함) — 초대 자체를 차단. A returning
      // left/declined member doesn't count against this cap a second time
      // (they already occupied a slot before), but a brand-new invite
      // still respects it.
      if (!existing && state.room.members.length >= MAX_ROOM_MEMBERS) return state;

      if (existing) {
        return {
          ...state,
          room: {
            ...state.room,
            members: updateMember(state.room.members, userId, {
              joinStatus: "invited",
              connectionStatus: "offline",
              joinedAt: null,
            }),
            updatedAt: nowIso(),
          },
        };
      }

      return {
        ...state,
        room: {
          ...state.room,
          members: [
            ...state.room.members,
            {
              userId,
              displayName,
              role: "member",
              joinStatus: "invited",
              connectionStatus: "offline",
              pttTestStatus: "not_tested",
              joinedAt: null,
            },
          ],
          updatedAt: nowIso(),
        },
      };
    }

    case ROOM_MEMBER_JOIN: {
      if (!state.room) return state;
      const { userId } = action.payload;
      return {
        ...state,
        room: {
          ...state.room,
          members: updateMember(state.room.members, userId, {
            joinStatus: "joined",
            connectionStatus: "online",
            joinedAt: nowIso(),
          }),
          updatedAt: nowIso(),
        },
      };
    }

    case ROOM_MEMBER_DECLINE: {
      if (!state.room) return state;
      const { userId } = action.payload;
      return {
        ...state,
        room: {
          ...state.room,
          members: updateMember(state.room.members, userId, {
            joinStatus: "declined",
            connectionStatus: "offline",
          }),
          updatedAt: nowIso(),
        },
      };
    }

    case ROOM_MEMBER_LEAVE: {
      if (!state.room) return state;
      const { userId } = action.payload;
      // Host can't "leave" their own room in this MVP — removing the host
      // would leave the Room ownerless, which isn't a case this Sprint
      // handles (§ 구현하지 않음: Room 재연결 등).
      if (userId === state.room.hostUserId) return state;
      return {
        ...state,
        room: {
          ...state.room,
          members: updateMember(state.room.members, userId, {
            joinStatus: "left",
            connectionStatus: "offline",
          }),
          updatedAt: nowIso(),
        },
      };
    }

    case ROOM_MEMBER_SET_CONNECTION_STATUS: {
      if (!state.room) return state;
      const { userId, connectionStatus } = action.payload;
      return {
        ...state,
        room: {
          ...state.room,
          members: updateMember(state.room.members, userId, { connectionStatus }),
          updatedAt: nowIso(),
        },
      };
    }

    case ROOM_MEMBER_SET_PTT_TEST_STATUS: {
      if (!state.room) return state;
      const { userId, pttTestStatus } = action.payload;
      return {
        ...state,
        room: {
          ...state.room,
          members: updateMember(state.room.members, userId, { pttTestStatus }),
          updatedAt: nowIso(),
        },
      };
    }

    case ROOM_MARK_IN_ROUND: {
      if (!state.room) return state;
      return {
        ...state,
        room: { ...state.room, status: "in_round", updatedAt: nowIso() },
      };
    }

    case ROOM_SET_HOST: {
      if (!state.room) return state;
      const { hostUserId } = action.payload;
      // Idempotent — no-op if the host is unchanged, so a redundant
      // host_changed / room_joined echo never churns state or roles.
      if (!hostUserId || state.room.hostUserId === hostUserId) return state;
      return {
        ...state,
        room: {
          ...state.room,
          hostUserId,
          members: state.room.members.map((m) => ({
            ...m,
            role: m.userId === hostUserId ? "host" : m.role === "host" ? "member" : m.role,
          })),
          updatedAt: nowIso(),
        },
      };
    }

    case ROOM_RESET: {
      return createEmptyRoomState();
    }

    default:
      return state;
  }
}
