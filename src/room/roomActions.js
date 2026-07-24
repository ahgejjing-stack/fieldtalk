/**
 * roomActions.js
 * ------------------------------------------------------------------
 * Round Room Foundation v0.1 §1/§2 — Room is a separate domain from
 * Round, with its own action/reducer/context, mirroring the exact same
 * pattern Round Engine already established (roundActions.js/
 * roundReducer.js/RoundProvider.jsx). Room only ever knows about
 * people/invite/connection/readiness — never course, holes, distance, or
 * score.
 * ------------------------------------------------------------------
 */

export const ROOM_CREATE = "ROOM_CREATE";
export const ROOM_JOIN_BY_CODE = "ROOM_JOIN_BY_CODE";
export const ROOM_MEMBER_INVITE = "ROOM_MEMBER_INVITE";
export const ROOM_MEMBER_JOIN = "ROOM_MEMBER_JOIN";
export const ROOM_MEMBER_DECLINE = "ROOM_MEMBER_DECLINE";
export const ROOM_MEMBER_LEAVE = "ROOM_MEMBER_LEAVE";
export const ROOM_MEMBER_SET_CONNECTION_STATUS = "ROOM_MEMBER_SET_CONNECTION_STATUS";
export const ROOM_MEMBER_SET_PTT_TEST_STATUS = "ROOM_MEMBER_SET_PTT_TEST_STATUS";
export const ROOM_MARK_IN_ROUND = "ROOM_MARK_IN_ROUND";
export const ROOM_SET_HOST = "ROOM_SET_HOST";
export const ROOM_RESET = "ROOM_RESET";

/** Creates a new Room with the host as its first member, already joined
 * (a host doesn't "invite" themselves). */
/** RC4 — title은 방 만들기 화면에서 입력받는다. 생략하면 리듀서가
 * "{닉네임}님의 라운드"를 기본값으로 채운다. */
export const roomCreate = (hostUserId, hostDisplayName, title = null) => ({
  type: ROOM_CREATE,
  payload: { hostUserId, hostDisplayName, title },
});

/** Runtime Identity v0.4 §6 — Member joins an EXISTING room by typing in
 * the code the Host is showing (DEV/Prototype-only; no real invite link/
 * QR this Sprint). Creates a minimal local Room object with just this
 * member — the authoritative membership list comes from the signaling
 * server (NetworkPttClient's `members` state) once CommunicationBridge
 * connects using this room's `code`; this local Room Engine object only
 * needs to exist so RoomOverlay.jsx's UI (mic prepare/PTT test/network
 * toggle) has something to render against. */
export const roomJoinByCode = (code, userId, displayName) => ({
  type: ROOM_JOIN_BY_CODE,
  payload: { code, userId, displayName },
});

export const roomMemberInvite = (userId, displayName) => ({
  type: ROOM_MEMBER_INVITE,
  payload: { userId, displayName },
});

/** §4 DEV simulation: no real invite link/QR exists yet, so this is how a
 * tester moves a member from "invited" to "joined" to exercise the rest
 * of the flow. */
export const roomMemberJoin = (userId) => ({
  type: ROOM_MEMBER_JOIN,
  payload: { userId },
});

export const roomMemberDecline = (userId) => ({
  type: ROOM_MEMBER_DECLINE,
  payload: { userId },
});

export const roomMemberLeave = (userId) => ({
  type: ROOM_MEMBER_LEAVE,
  payload: { userId },
});

export const roomMemberSetConnectionStatus = (userId, connectionStatus) => ({
  type: ROOM_MEMBER_SET_CONNECTION_STATUS,
  payload: { userId, connectionStatus },
});

export const roomMemberSetPttTestStatus = (userId, pttTestStatus) => ({
  type: ROOM_MEMBER_SET_PTT_TEST_STATUS,
  payload: { userId, pttTestStatus },
});

/** §6 step 10 — dispatched by the START coordinator alongside the Round's
 * own start action. Room and Round are separate reducers/Contexts; this
 * is the Room-side half of that atomic-feeling transition. */
export const roomMarkInRound = () => ({
  type: ROOM_MARK_IN_ROUND,
  payload: {},
});

/** RC4 Issue 4 (Host transfer) — the server is the source of truth for
 * who is host. This mirrors a server host_changed / room_joined hostUserId
 * into local Room state so the UI (라운드 시작 권한, "· Host" badge) and
 * the round-start/hole-advance gates follow the new host. Also updates the
 * affected members' `role` fields so anything keyed on role stays coherent. */
export const roomSetHost = (hostUserId) => ({
  type: ROOM_SET_HOST,
  payload: { hostUserId },
});

export const roomReset = () => ({
  type: ROOM_RESET,
  payload: {},
});
