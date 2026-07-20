/**
 * runtimeModeAndSnapshot.test.js
 * ------------------------------------------------------------------
 * Course Reference Integration Hardening v0.2 §9 — tests 1, 2, 3, 6.
 * (Test 4 lives in providerComparison.test.js; test 5, Snapshot
 * immutability, was already covered by Prototype v0.1's manual
 * verification and is re-confirmed here for completeness under the new
 * courseSnapshotAppliedWithHoles action too.)
 *
 * Run directly with: node src/course/runtimeModeAndSnapshot.test.js
 * ------------------------------------------------------------------
 */
import assert from "node:assert/strict";
import { roundReducer } from "../engine/roundReducer.js";
import { createRoundSeed } from "../data/roundSeed.js";
import * as actions from "../engine/roundActions.js";
import { selectPlayerGps, selectCurrentHole } from "../engine/roundSelectors.js";
import { RUNTIME_MODES } from "../config/runtimeMode.js";
import { LocalJsonCourseProvider } from "./providers/LocalJsonCourseProvider.js";
import { RAW_TEST_COURSE } from "./testCourseData.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok — ${name}`);
}

console.log("runtimeModeAndSnapshot.test.js");

test("§9-1 Demo mode, 실제 좌표 없음 -> mock GPS 반환", () => {
  const state = createRoundSeed();
  const gps = selectPlayerGps(state, "player_jaesik", { runtimeMode: RUNTIME_MODES.DEMO });
  assert.equal(typeof gps.valueM, "number");
  assert.equal(gps.valueM, 136); // GPS_BASE_M mock, unchanged from Prototype v0.1
});

test("§9-2 Production mode, 실제 좌표 없음 -> null 반환 (mock 절대 사용 안 함)", () => {
  const state = createRoundSeed();
  const gps = selectPlayerGps(state, "player_jaesik", { runtimeMode: RUNTIME_MODES.PRODUCTION });
  assert.equal(gps, null);
});

test("§9-3 Production mode, Course Level 2 + player location -> 실제 haversine 거리 반환", async () => {
  let state = createRoundSeed();
  const provider = new LocalJsonCourseProvider();
  const courseRef = await provider.getCourseById("local_test_course_001");
  state = roundReducer(state, actions.courseSnapshotApplied(courseRef));
  state = roundReducer(state, actions.playerSetLocation("player_jaesik", 37.4, 127.10155));

  const gps = selectPlayerGps(state, "player_jaesik", { runtimeMode: RUNTIME_MODES.PRODUCTION });
  assert.equal(typeof gps.valueM, "number");
  assert.equal(gps.valueM, 137); // matches the known haversine result for this coordinate pair
});

test("§9-2b Production mode: 옵션 자체를 생략하면 기본값은 Demo (하위 호환)", () => {
  const state = createRoundSeed();
  const gps = selectPlayerGps(state, "player_jaesik"); // no options arg at all
  assert.equal(gps.valueM, 136); // still the pre-Sprint mock behavior
});

test("§9-6 선택한 코스의 Hole PAR가 Round holes에 적용된다 (Header/Score가 읽는 소스)", async () => {
  let state = createRoundSeed();
  const provider = new LocalJsonCourseProvider();
  const courseRef = await provider.getCourseById("local_test_course_001");
  state = roundReducer(state, actions.courseSnapshotAppliedWithHoles(courseRef, 3));

  const hole3 = selectCurrentHole(state); // currentHoleNumber was set to 3
  assert.equal(hole3.number, 3);
  assert.equal(hole3.par, RAW_TEST_COURSE.holes.find((h) => h.number === 3).par);
  assert.equal(hole3.par, 3); // this test course's hole 3 is a par-3

  // Play-state fields must be untouched, not overwritten wholesale.
  assert.ok("status" in hole3);
  assert.ok("pin" in hole3);
  assert.ok("wind" in hole3);
});

test("§9-5 Snapshot 불변성 (courseSnapshotAppliedWithHoles 경로도 동일하게 보장)", async () => {
  let state = createRoundSeed();
  const provider = new LocalJsonCourseProvider();
  const courseRef = await provider.getCourseById("local_test_course_001");
  state = roundReducer(state, actions.courseSnapshotAppliedWithHoles(courseRef, 1));

  const parBefore = state.holes.find((h) => h.number === 5).par;
  RAW_TEST_COURSE.holes.find((h) => h.number === 5).par = 99; // mutate original source
  const parAfter = state.holes.find((h) => h.number === 5).par;
  assert.equal(parBefore, parAfter);
  assert.notEqual(parAfter, 99);
});

console.log(`\n${passed} passed, 0 failed`);
