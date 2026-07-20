/**
 * normalizeCourse.js
 * ------------------------------------------------------------------
 * Course Reference Prototype §2/§3 — converts a provider's raw shape
 * into FIELDTALK's internal CourseReference model. This is the ONLY
 * place a provider's field names are read; everything downstream
 * (Provider Adapter callers, Round Snapshot) only ever sees the
 * normalized shape below.
 *
 * COURSE_REFERENCE_STRATEGY_v1.md §4:
 *   External Provider → Provider Adapter → CourseReference Model → ...
 * This file is the "→ CourseReference Model" arrow.
 * ------------------------------------------------------------------
 */

/**
 * @typedef {Object} CourseReference
 * @property {string} id
 * @property {number} dataLevel
 * @property {string} source
 * @property {string} sourceCourseId
 * @property {number} dataVersion
 * @property {string} updatedAt
 * @property {string} confidence
 * @property {{id: string, name: string, region?: string, latitude?: number, longitude?: number}} golfClub
 * @property {{id: string, name: string, holeCount: number}} course
 * @property {Array<{id: string, number: number, par: number, greenCenter: {latitude: number, longitude: number} | null}>} holes
 */

/**
 * @param {*} raw - provider-specific raw shape (e.g. RAW_TEST_COURSE)
 * @returns {CourseReference}
 */
export function normalizeCourse(raw) {
  if (!raw) return null;

  const holes = (raw.holes ?? []).map((h) => ({
    id: h.id,
    number: h.number,
    par: h.par,
    greenCenter:
      h.greenCenter && typeof h.greenCenter.latitude === "number" && typeof h.greenCenter.longitude === "number"
        ? { latitude: h.greenCenter.latitude, longitude: h.greenCenter.longitude }
        : null,
  }));

  return {
    id: raw.providerCourseId,
    dataLevel: raw.meta?.dataLevel ?? 0,
    source: raw.meta?.source ?? "unknown",
    sourceCourseId: raw.providerCourseId,
    dataVersion: raw.meta?.dataVersion ?? 1,
    updatedAt: raw.meta?.updatedAtIso ?? null,
    confidence: raw.meta?.confidence ?? "unknown",
    golfClub: {
      id: raw.club?.providerClubId,
      name: raw.club?.displayName,
      region: raw.club?.region,
      latitude: raw.club?.latitude,
      longitude: raw.club?.longitude,
    },
    course: {
      id: raw.providerCourseId,
      name: raw.courseName,
      holeCount: holes.length,
    },
    holes,
  };
}
