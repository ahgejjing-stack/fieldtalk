/**
 * providerComparison.test.js
 * ------------------------------------------------------------------
 * Course Reference Integration Hardening v0.2 §2/§9 test 4 — proves two
 * providers with completely different raw shapes (LocalJsonCourseProvider:
 * nested club/holes with latitude/longitude; AlternateMockCourseProvider:
 * venue/track/scorecard with lat/lng) normalize to the SAME core
 * CourseReference structure (same par/greenCenter per hole), differing
 * only in the source/sourceCourseId metadata that's supposed to differ.
 *
 * Run directly with: node src/course/providerComparison.test.js
 * ------------------------------------------------------------------
 */
import assert from "node:assert/strict";
import { LocalJsonCourseProvider } from "./providers/LocalJsonCourseProvider.js";
import { AlternateMockCourseProvider } from "./providers/AlternateMockCourseProvider.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok — ${name}`);
}

console.log("providerComparison.test.js");

const providerA = new LocalJsonCourseProvider();
const providerB = new AlternateMockCourseProvider();

const courseA = await providerA.getCourseById("local_test_course_001");
const courseB = await providerB.getCourseById("alt_track_001");

test("두 Provider 모두 18홀을 정규화한다", () => {
  assert.equal(courseA.holes.length, 18);
  assert.equal(courseB.holes.length, 18);
});

test("모든 홀의 PAR가 정확히 일치한다 (서로 다른 raw 구조, 같은 의미)", () => {
  for (let i = 0; i < 18; i += 1) {
    assert.equal(
      courseA.holes[i].par,
      courseB.holes[i].par,
      `hole ${i + 1} par mismatch: A=${courseA.holes[i].par} B=${courseB.holes[i].par}`
    );
  }
});

test("모든 홀의 Green Center 좌표가 정확히 일치한다", () => {
  for (let i = 0; i < 18; i += 1) {
    assert.equal(courseA.holes[i].greenCenter.latitude, courseB.holes[i].greenCenter.latitude);
    assert.equal(courseA.holes[i].greenCenter.longitude, courseB.holes[i].greenCenter.longitude);
  }
});

test("dataLevel이 동일하다 (둘 다 Level 2 테스트 데이터)", () => {
  assert.equal(courseA.dataLevel, 2);
  assert.equal(courseB.dataLevel, 2);
});

test("source/sourceCourseId는 공급자에 맞게 서로 다르다", () => {
  assert.notEqual(courseA.source, courseB.source);
  assert.equal(courseA.source, "local_test");
  assert.equal(courseB.source, "local_test_alternate");
  assert.notEqual(courseA.sourceCourseId, courseB.sourceCourseId);
});

test("Provider 고유 raw 필드가 정규화 결과에 남지 않는다", () => {
  // Provider B의 raw 전용 필드명(venue_code, hole_no, par_value, lat, lng 등)이
  // 정규화된 CourseReference 어디에도 키로 존재하면 안 된다.
  const serialized = JSON.stringify(courseB);
  assert.ok(!serialized.includes("venue_code"));
  assert.ok(!serialized.includes("hole_no"));
  assert.ok(!serialized.includes("par_value"));
  assert.ok(!serialized.includes('"lat"'));
  assert.ok(!serialized.includes('"lng"'));
});

test("두 CourseReference 모두 동일한 필드 집합을 갖는다 (홀 단위)", () => {
  const keysA = Object.keys(courseA.holes[0]).sort();
  const keysB = Object.keys(courseB.holes[0]).sort();
  assert.deepEqual(keysA, keysB);
});

console.log(`\n${passed} passed, 0 failed`);
