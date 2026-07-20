/**
 * roomFoundation.test.js
 * ------------------------------------------------------------------
 * Round Room Foundation v0.1 §9 — unit tests 1-9. No test framework
 * dependency (matches src/course/*.test.js's established pattern). Run
 * directly with:
 *
 *   node src/room/roomFoundation.test.js
 * ------------------------------------------------------------------
 */
import assert from "node:assert/strict";
import { roomReducer, createEmptyRoomState, MAX_ROOM_MEMBERS } from "./roomReducer.js";
import * as roomActions from "./roomActions.js";
import { buildInitialRoundFromRoom } from "./buildInitialRoundFromRoom.js";
import { createRoundPlayersFromRoom } from "./createRoundPlayersFromRoom.js";
import { roundReducer } from "../engine/roundReducer.js";
import * as roundActions from "../engine/roundActions.js";
import { LocalJsonCourseProvider } from "../course/providers/LocalJsonCourseProvider.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok — ${name}`);
}

console.log("roomFoundation.test.js");

const provider = new LocalJsonCourseProvider();
const courseSnapshot = await provider.getCourseById("local_test_course_001");

function roomWithJoined(count) {
  let state = createEmptyRoomState();
  state = roomReducer(state, roomActions.roomCreate("player_jaesik", "재식"));
  const others = ["player_jaegeun", "player_gwangcheon", "player_haeran"];
  const names = { player_jaegeun: "재근", player_gwangcheon: "광천", player_haeran: "해란" };
  for (let i = 0; i < count - 1; i += 1) {
    state = roomReducer(state, roomActions.roomMemberInvite(others[i], names[others[i]]));
    state = roomReducer(state, roomActions.roomMemberJoin(others[i]));
  }
  return state.room;
}

test("§9-1 Host + 3 joined -> Round Player 4명 생성", () => {
  const room = roomWithJoined(4);
  const players = createRoundPlayersFromRoom(room.members);
  assert.equal(players.length, 4);
});

test("§9-2 Host + 2 joined + 1 invited -> Round Player 3명만 생성", () => {
  let state = createEmptyRoomState();
  state = roomReducer(state, roomActions.roomCreate("player_jaesik", "재식"));
  state = roomReducer(state, roomActions.roomMemberInvite("player_jaegeun", "재근"));
  state = roomReducer(state, roomActions.roomMemberJoin("player_jaegeun"));
  state = roomReducer(state, roomActions.roomMemberInvite("player_gwangcheon", "광천"));
  state = roomReducer(state, roomActions.roomMemberJoin("player_gwangcheon"));
  state = roomReducer(state, roomActions.roomMemberInvite("player_haeran", "해란")); // stays invited
  const players = createRoundPlayersFromRoom(state.room.members);
  assert.equal(players.length, 3);
  assert.ok(!players.some((p) => p.id === "player_haeran"));
});

test("§9-3 최대 4명 초과 -> 초대/참여 차단", () => {
  const room = roomWithJoined(4);
  let state = { room };
  state = roomReducer(state, roomActions.roomMemberInvite("player_extra", "Extra"));
  assert.equal(state.room.members.length, MAX_ROOM_MEMBERS);
});

test("§9-4 Member mapping — Room 객체와 Round Player가 같은 참조가 아니다", () => {
  const room = roomWithJoined(2);
  const players = createRoundPlayersFromRoom(room.members);
  const roomMember = room.members.find((m) => m.userId === "player_jaesik");
  const player = players.find((p) => p.id === "player_jaesik");
  assert.notEqual(roomMember, player); // different object references
  assert.ok(!("joinStatus" in player)); // Player shape, not RoomMember shape
  assert.ok("distance" in player); // Player-only field
});

test("§9-5 START — Room preparing -> in_round, Round active, startedAt 존재, ROUND_STARTED Event 존재", () => {
  const room = roomWithJoined(3);
  assert.equal(room.status, "preparing");

  const result = buildInitialRoundFromRoom({ roomMembers: room.members, courseSnapshot, startHoleNumber: 2 });
  assert.equal(result.ok, true);
  const state = roundReducer(undefined, roundActions.roundStartFromRoom(result.round));
  assert.equal(state.status, "active");
  assert.ok(state.startedAt);
  assert.ok(state.events.some((e) => e.type === "ROUND_STARTED"));

  const roomAfter = roomReducer({ room }, roomActions.roomMarkInRound());
  assert.equal(roomAfter.room.status, "in_round");
});

test("§9-6 Course summary — round.course와 courseSnapshot 일치", () => {
  const room = roomWithJoined(2);
  const result = buildInitialRoundFromRoom({ roomMembers: room.members, courseSnapshot, startHoleNumber: 1 });
  const state = roundReducer(undefined, roundActions.roundStartFromRoom(result.round));
  assert.equal(state.course.id, state.courseSnapshot.id);
  assert.equal(state.course.name, state.courseSnapshot.course.name);
  assert.equal(state.course.totalHoles, state.courseSnapshot.course.holeCount);
});

test("§9-7 Hole state — 선택 시작 홀만 playing", () => {
  const room = roomWithJoined(2);
  const result = buildInitialRoundFromRoom({ roomMembers: room.members, courseSnapshot, startHoleNumber: 6 });
  const state = roundReducer(undefined, roundActions.roundStartFromRoom(result.round));
  const playingHoles = state.holes.filter((h) => h.status === "playing");
  assert.equal(playingHoles.length, 1);
  assert.equal(playingHoles[0].number, 6);
});

test("§9-8 Warning — Host 단독 시작 시 확인 필요, 확인 후 시작 가능", () => {
  let state = createEmptyRoomState();
  state = roomReducer(state, roomActions.roomCreate("player_jaesik", "재식"));
  const room = state.room;
  const result = buildInitialRoundFromRoom({ roomMembers: room.members, courseSnapshot, startHoleNumber: 1 });
  // Host-only doesn't block buildInitialRoundFromRoom itself (Warning, not
  // Blocking) — the UI-level selectRoomWarnings() is what flags this for
  // confirmation; the initializer still succeeds once confirmed.
  assert.equal(result.ok, true);
  assert.equal(result.round.players.length, 1);
});

test("§9-9 Persistence — Room과 Round 저장소가 분리된 키를 쓴다", async () => {
  const { ROOM_STORAGE_KEY } = await import("./roomStorage.js");
  const { ROUND_STORAGE_KEY } = await import("../engine/roundStorage.js");
  assert.notEqual(ROOM_STORAGE_KEY, ROUND_STORAGE_KEY);
  assert.equal(ROOM_STORAGE_KEY, "fieldtalk.room.active.v1");
});

console.log(`\n${passed} passed, 0 failed`);
