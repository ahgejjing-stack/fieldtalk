/**
 * courseReferenceServiceInstance.js
 * ------------------------------------------------------------------
 * Course Reference Integration Hardening v0.2 §3 — the shared service
 * instance every component uses. Defaults to LocalJsonCourseProvider
 * (Provider A). `setProvider()` is exposed so a DEV control can switch
 * to AlternateMockCourseProvider (Provider B) to prove the swap needs
 * zero UI/Round Engine changes — see DistanceCard.jsx's DEV block and
 * PreRoundCourseSelect.jsx.
 * ------------------------------------------------------------------
 */
import { CourseReferenceService } from "./CourseReferenceService.js";
import { LocalJsonCourseProvider } from "./providers/LocalJsonCourseProvider.js";
import { AlternateMockCourseProvider } from "./providers/AlternateMockCourseProvider.js";

export const courseProviderA = new LocalJsonCourseProvider();
export const courseProviderB = new AlternateMockCourseProvider();

export const courseReferenceService = new CourseReferenceService(courseProviderA);
