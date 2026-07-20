/**
 * testAlternateCourseData.js
 * ------------------------------------------------------------------
 * Course Reference Integration Hardening v0.2 §2 — TEST DATA ONLY.
 *
 * Deliberately the SAME semantic course as testCourseData.js (same PAR
 * per hole, same green center coordinates) so the two providers'
 * normalized outputs can be compared directly — but described in a
 * completely different raw shape (venue_code/track/scorecard nesting,
 * `lat`/`lng` instead of `latitude`/`longitude`, `hole_no`/`par_value`
 * instead of `number`/`par`). This proves normalizeAlternateCourse.js is
 * doing real translation work, not just aliasing testCourseData.js.
 *
 * Names are deliberately distinct from both testCourseData.js's "[TEST]
 * 그린필드 테스트 클럽" and the app's unrelated "레이크사이드 CC" demo, so
 * all three are never confused with each other.
 * ------------------------------------------------------------------
 */
import { RAW_TEST_COURSE } from "./testCourseData.js";

function buildScorecard() {
  return RAW_TEST_COURSE.holes.map((h) => ({
    hole_no: h.number,
    par_value: h.par,
    green: {
      lat: h.greenCenter.latitude,
      lng: h.greenCenter.longitude,
    },
  }));
}

/** Raw shape from a hypothetical second provider — venue/track/scorecard
 * nesting, snake_case field names, lat/lng instead of latitude/longitude.
 * No relation to testCourseData.js's shape at all. */
export const RAW_ALTERNATE_COURSE = {
  venue_code: "alt_venue_001",
  venue_name: "[TEST-B] 서닝필드 목업 클럽",
  track: {
    code: "alt_track_001",
    title: "[TEST-B] B트랙",
    scorecard: buildScorecard(),
  },
  meta_source: "local_test_alternate",
  meta_data_level: 2,
  meta_version: 1,
  meta_updated_at: "2026-01-01T00:00:00.000Z",
  meta_confidence: "test_only",
};
