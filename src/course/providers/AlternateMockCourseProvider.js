/**
 * AlternateMockCourseProvider.js
 * ------------------------------------------------------------------
 * Course Reference Integration Hardening v0.2 §2 — a second Provider
 * with a genuinely different raw shape and its own normalizer
 * (normalizeAlternateCourse.js), proving CourseReferenceProvider's
 * contract is really provider-agnostic and not secretly coupled to
 * LocalJsonCourseProvider's JSON layout.
 * ------------------------------------------------------------------
 */
import { CourseReferenceProvider } from "./CourseReferenceProvider.js";
import { RAW_ALTERNATE_COURSE } from "../testAlternateCourseData.js";
import { normalizeAlternateCourse } from "../normalizeAlternateCourse.js";

export class AlternateMockCourseProvider extends CourseReferenceProvider {
  async getCourseById(courseId) {
    if (courseId !== RAW_ALTERNATE_COURSE.track.code) return null;
    return normalizeAlternateCourse(RAW_ALTERNATE_COURSE);
  }

  async listCourses() {
    return [normalizeAlternateCourse(RAW_ALTERNATE_COURSE)];
  }
}
