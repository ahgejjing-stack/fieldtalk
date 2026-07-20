/**
 * CourseReferenceProvider.js
 * ------------------------------------------------------------------
 * Course Reference Prototype §3 — the Provider Adapter boundary.
 *
 * Every course data source (local test JSON now; government open data,
 * a commercial provider, or OSM later — see COURSE_REFERENCE_STRATEGY_v1.md
 * §3) implements this same contract. RoundScreen/Round Engine only ever
 * talk to a CourseReferenceProvider — never to a provider's raw format,
 * and never by importing a provider's data file directly.
 *
 * Plain JS "interface": a base class whose methods throw if a subclass
 * doesn't override them. No framework needed for three methods.
 * ------------------------------------------------------------------
 */
export class CourseReferenceProvider {
  /**
   * @param {string} courseId
   * @returns {Promise<import("./normalizeCourse.js").CourseReference | null>}
   */
  // eslint-disable-next-line no-unused-vars
  async getCourseById(courseId) {
    throw new Error("CourseReferenceProvider.getCourseById() not implemented");
  }

  /**
   * @returns {Promise<import("./normalizeCourse.js").CourseReference[]>}
   */
  async listCourses() {
    throw new Error("CourseReferenceProvider.listCourses() not implemented");
  }
}
