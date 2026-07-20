/**
 * LocalJsonCourseProvider.js
 * ------------------------------------------------------------------
 * Course Reference Prototype §3/§4 — the only Provider implementation
 * this Sprint ships. Wraps the local test course data and normalizes it
 * on the way out, so callers never see the raw provider shape.
 *
 * "RoundScreen이나 Round Engine이 Local JSON 파일을 직접 import하지
 * 않도록" — this file is the sole importer of testCourseData.js.
 * ------------------------------------------------------------------
 */
import { CourseReferenceProvider } from "./CourseReferenceProvider.js";
import { RAW_TEST_COURSE } from "../testCourseData.js";
import { normalizeCourse } from "../normalizeCourse.js";

export class LocalJsonCourseProvider extends CourseReferenceProvider {
  async getCourseById(courseId) {
    if (courseId !== RAW_TEST_COURSE.providerCourseId) return null;
    return normalizeCourse(RAW_TEST_COURSE);
  }

  async listCourses() {
    return [normalizeCourse(RAW_TEST_COURSE)];
  }
}
