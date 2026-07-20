/**
 * CourseReferenceService.js
 * ------------------------------------------------------------------
 * Course Reference Integration Hardening v0.2 §3 — one more layer of
 * indirection so components never construct a Provider directly:
 *
 *   Component → CourseReferenceService → CourseReferenceProvider → CourseReference
 *
 * `new LocalJsonCourseProvider()` inside DistanceCard.jsx (Prototype
 * v0.1's shortcut) is gone — DistanceCard/PreRoundCourseSelect now only
 * ever call methods on a shared CourseReferenceService instance, and have
 * no idea whether that service is currently backed by
 * LocalJsonCourseProvider, AlternateMockCourseProvider, or (later) a real
 * external provider.
 * ------------------------------------------------------------------
 */
export class CourseReferenceService {
  /** @param {import("./providers/CourseReferenceProvider.js").CourseReferenceProvider} provider */
  constructor(provider) {
    this.provider = provider;
  }

  /** @param {import("./providers/CourseReferenceProvider.js").CourseReferenceProvider} provider */
  setProvider(provider) {
    this.provider = provider;
  }

  async listAvailableCourses() {
    if (!this.provider) return [];
    return this.provider.listCourses();
  }

  async getCourse(courseId) {
    if (!this.provider) return null;
    return this.provider.getCourseById(courseId);
  }
}
