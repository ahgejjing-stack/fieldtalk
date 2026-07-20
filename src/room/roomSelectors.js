/**
 * roomSelectors.js
 * ------------------------------------------------------------------
 * Round Room Foundation v0.1 — pure selectors over Room state.
 * ------------------------------------------------------------------
 */

export function selectJoinedMembers(room) {
  if (!room) return [];
  return room.members.filter((m) => m.joinStatus === "joined");
}

export function selectInvitedMembers(room) {
  if (!room) return [];
  return room.members.filter((m) => m.joinStatus === "invited");
}

export function selectHostMember(room) {
  if (!room) return null;
  return room.members.find((m) => m.userId === room.hostUserId) ?? null;
}

/**
 * §5 Ready Status — Warning-tier items only (Blocking items — "Room 생성
 * 실패"/"Snapshot 생성 실패" — are action-result failures, not something
 * derivable by inspecting steady-state Room data, so the START coordinator
 * itself reports those directly rather than this selector guessing at
 * them).
 *
 * @returns {string[]} warning codes: "host_only" | "ptt_test_incomplete" |
 *   "course_not_selected" | "start_hole_not_selected"
 */
export function selectRoomWarnings(room, { courseSelected, startHoleSelected, currentUserId } = {}) {
  const warnings = [];
  const joined = selectJoinedMembers(room);

  if (joined.length <= 1) warnings.push("host_only");
  // Sprint 5.1 §5 — "사용자가 해결할 수 없는 Warning은 보여주지 않습니다."
  // Whether someone ELSE'S mic actually works is not something the person
  // looking at the START button can verify or fix — only each person can
  // confirm their own. Checking everyone's status makes this warning
  // permanently unsolvable whenever any companion has no separate device
  // to complete their own test on. Checking only the current user's own
  // status keeps the warning meaningful (and always actionable: press and
  // hold your own mic row) without asking the host to vouch for others.
  const pttCheckTarget = currentUserId ? joined.filter((m) => m.userId === currentUserId) : joined;
  if (pttCheckTarget.some((m) => m.pttTestStatus !== "completed")) warnings.push("ptt_test_incomplete");
  if (!courseSelected) warnings.push("course_not_selected");
  if (!startHoleSelected) warnings.push("start_hole_not_selected");

  return warnings;
}

export const ROOM_WARNING_LABELS = {
  host_only: "Host만 입장했습니다",
  ptt_test_incomplete: "내 마이크 확인이 아직 안 됐습니다",
  course_not_selected: "코스가 선택되지 않았습니다",
  start_hole_not_selected: "시작 홀이 선택되지 않았습니다",
};
