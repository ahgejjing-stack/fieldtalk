/**
 * testCourseData.js
 * ------------------------------------------------------------------
 * Course Reference Prototype §4 — TEST DATA ONLY.
 *
 * This is an explicitly fictional course, not a real golf club. Every
 * coordinate here is synthetic — chosen for clean, verifiable haversine
 * math, not sourced from or resembling any real, identifiable venue.
 * `source: "local_test"` and `dataLevel: 2` are set on every record so
 * nothing downstream can mistake this for production Course Reference
 * data. Names are deliberately different from the app's existing
 * hardcoded demo ("레이크사이드 CC") so the two mock sources are never
 * confused with each other — see roundSeed.js / HomeScreen.jsx for that
 * separate, unrelated mock.
 * ------------------------------------------------------------------
 */

// Green center for the "active" test hole (7) — an explicitly synthetic
// point, not a real course's coordinates.
const HOLE_7_GREEN = { latitude: 37.4, longitude: 127.1 };

/** Deterministic, clearly-synthetic per-hole offset so all 18 holes have
 * distinct (but not realistic-looking) green centers. Not derived from
 * any real course layout. */
function syntheticGreenCenter(holeNumber) {
  const n = holeNumber - 7; // hole 7 is the "anchor" at offset 0
  return {
    latitude: +(HOLE_7_GREEN.latitude + n * 0.0009).toFixed(6),
    longitude: +(HOLE_7_GREEN.longitude + n * 0.0011).toFixed(6),
  };
}

const PARS_BY_HOLE = [4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5];

function buildTestHoles() {
  const holes = [];
  for (let number = 1; number <= 18; number += 1) {
    holes.push({
      id: `test_hole_${number}`,
      number,
      par: PARS_BY_HOLE[number - 1],
      greenCenter: syntheticGreenCenter(number),
    });
  }
  return holes;
}

/** Raw shape as it would come "from a provider" — deliberately NOT the
 * same shape as the normalized CourseReference model (courseReferenceModel
 * naming differs on purpose) so normalizeCourse.js has real work to do,
 * matching "외부 공급자의 필드명을 Round에 직접 저장하지 않는다"
 * (COURSE_REFERENCE_STRATEGY_v1.md §4). */
export const RAW_TEST_COURSE = {
  providerCourseId: "local_test_course_001",
  club: {
    providerClubId: "local_test_club_001",
    displayName: "[TEST] 그린필드 테스트 클럽",
    region: "테스트 지역",
  },
  courseName: "[TEST] A코스",
  holes: buildTestHoles(),
  meta: {
    source: "local_test",
    dataLevel: 2,
    dataVersion: 1,
    updatedAtIso: "2026-01-01T00:00:00.000Z",
    confidence: "test_only",
  },
};

/** Fixed, clearly-synthetic test coordinates for each of the 4 demo
 * players, all at different (real, computed) distances from HOLE_7_GREEN.
 * Used only by the DEV "코스 적용" control (RoundScreen/DistanceCard) to
 * simulate "각 플레이어의 현재 좌표" without a real Room/Realtime layer —
 * see docs/PRE_ROUND_EXPERIENCE_v1.md for why real multi-user location
 * sharing is out of scope for this prototype. */
export const TEST_PLAYER_LOCATIONS = {
  player_jaesik: { latitude: 37.4, longitude: 127.10155 },
  player_jaegeun: { latitude: 37.4013, longitude: 127.1 },
  player_gwangcheon: { latitude: 37.3997, longitude: 127.09875 },
  player_haeran: { latitude: 37.3989, longitude: 127.10055 },
};
