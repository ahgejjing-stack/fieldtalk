/**
 * normalizeAlternateCourse.js
 * ------------------------------------------------------------------
 * Course Reference Integration Hardening v0.2 §2 — a SEPARATE normalizer
 * for AlternateMockCourseProvider's raw shape (venue_code/track/scorecard,
 * snake_case, lat/lng). Deliberately does NOT reuse normalizeCourse.js —
 * "LocalJsonCourseProvider와 동일한 raw 구조를 재사용하지 않음... 자체
 * normalize 또는 Provider 전용 Adapter 사용." Both normalizers produce the
 * exact same CourseReference shape (see normalizeCourse.js's typedef) so
 * nothing downstream can tell which provider a course came from except
 * via the `source`/`sourceCourseId` metadata fields.
 * ------------------------------------------------------------------
 */

/**
 * @param {*} raw - RAW_ALTERNATE_COURSE-shaped provider data
 * @returns {import("./normalizeCourse.js").CourseReference | null}
 */
export function normalizeAlternateCourse(raw) {
  if (!raw) return null;

  const holes = (raw.track?.scorecard ?? []).map((entry) => ({
    id: `${raw.track.code}_hole_${entry.hole_no}`,
    number: entry.hole_no,
    par: entry.par_value,
    greenCenter:
      entry.green && typeof entry.green.lat === "number" && typeof entry.green.lng === "number"
        ? { latitude: entry.green.lat, longitude: entry.green.lng }
        : null,
  }));

  return {
    id: raw.track?.code,
    dataLevel: raw.meta_data_level ?? 0,
    source: raw.meta_source ?? "unknown",
    sourceCourseId: raw.track?.code,
    dataVersion: raw.meta_version ?? 1,
    updatedAt: raw.meta_updated_at ?? null,
    confidence: raw.meta_confidence ?? "unknown",
    golfClub: {
      id: raw.venue_code,
      name: raw.venue_name,
      region: undefined,
      latitude: undefined,
      longitude: undefined,
    },
    course: {
      id: raw.track?.code,
      name: raw.track?.title,
      holeCount: holes.length,
    },
    holes,
  };
}
