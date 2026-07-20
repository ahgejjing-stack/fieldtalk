/**
 * geoDistance.test.js
 * ------------------------------------------------------------------
 * Course Reference Prototype §6 — unit tests for the pure haversine
 * distance calculator. No test framework dependency (none is configured
 * in this project) — run directly with:
 *
 *   node src/course/geoDistance.test.js
 *
 * Exits 0 on success, non-zero (via assert throwing) on first failure.
 * ------------------------------------------------------------------
 */
import assert from "node:assert/strict";
import { haversineDistanceM, roundDistanceM, isValidCoordinate } from "./geoDistance.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok — ${name}`);
}

console.log("geoDistance.test.js");

test("동일 좌표 → 0m", () => {
  const p = { latitude: 37.5, longitude: 127.0 };
  assert.equal(haversineDistanceM(p, p), 0);
});

test("알려진 두 좌표 간 예상 거리 (위도 0.001도 ≈ 111.19m, 구면 근사)", () => {
  const a = { latitude: 37.5, longitude: 127.0 };
  const b = { latitude: 37.501, longitude: 127.0 };
  const d = haversineDistanceM(a, b);
  // Pure latitude separation on a sphere of radius 6371000m:
  // 6371000 * (0.001 * pi/180) ≈ 111.195m — assert within 0.5m tolerance.
  assert.ok(Math.abs(d - 111.195) < 0.5, `expected ~111.195m, got ${d}`);
});

test("null 좌표 → null", () => {
  assert.equal(haversineDistanceM(null, { latitude: 37.5, longitude: 127.0 }), null);
  assert.equal(haversineDistanceM({ latitude: 37.5, longitude: 127.0 }, null), null);
  assert.equal(haversineDistanceM(null, null), null);
});

test("잘못된 위도/경도 범위 → null", () => {
  assert.equal(haversineDistanceM({ latitude: 200, longitude: 127.0 }, { latitude: 37.5, longitude: 127.0 }), null);
  assert.equal(haversineDistanceM({ latitude: 37.5, longitude: -200 }, { latitude: 37.5, longitude: 127.0 }), null);
  assert.equal(haversineDistanceM({ latitude: NaN, longitude: 127.0 }, { latitude: 37.5, longitude: 127.0 }), null);
});

test("매우 가까운 거리 (약 1m)", () => {
  // ~0.000009 degrees of latitude ≈ 1m
  const a = { latitude: 37.5, longitude: 127.0 };
  const b = { latitude: 37.500009, longitude: 127.0 };
  const d = haversineDistanceM(a, b);
  assert.ok(d > 0.5 && d < 1.5, `expected ~1m, got ${d}`);
});

test("1000m 초과 거리 — haversineDistanceM 자체는 clamp하지 않고 실제 값을 그대로 반환", () => {
  const a = { latitude: 37.5, longitude: 127.0 };
  const b = { latitude: 37.51, longitude: 127.0 }; // ~1112m apart
  const d = haversineDistanceM(a, b);
  assert.ok(d > 1000, `expected > 1000m (unclamped), got ${d}`);
});

test("roundDistanceM — 정상값 반올림", () => {
  assert.equal(roundDistanceM(132.4), 132);
  assert.equal(roundDistanceM(132.6), 133);
});

test("roundDistanceM — null/NaN 입력 → null", () => {
  assert.equal(roundDistanceM(null), null);
  assert.equal(roundDistanceM(NaN), null);
  assert.equal(roundDistanceM(undefined), null);
});

test("isValidCoordinate — 경계값", () => {
  assert.equal(isValidCoordinate({ latitude: 90, longitude: 180 }), true);
  assert.equal(isValidCoordinate({ latitude: -90, longitude: -180 }), true);
  assert.equal(isValidCoordinate({ latitude: 90.1, longitude: 0 }), false);
  assert.equal(isValidCoordinate({ latitude: 0, longitude: 180.1 }), false);
});

console.log(`\n${passed} passed, 0 failed`);
