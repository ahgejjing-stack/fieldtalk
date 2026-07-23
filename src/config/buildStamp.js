/**
 * buildStamp.js — RC4 build identity.
 * Founder request #1: prove the device is running the LATEST code and not a
 * cached bundle. Lives in its own module (not App.jsx) so any component can
 * import it without creating a circular dependency.
 * Update this string on every build handed to device testing.
 */
export const RC4_BUILD_STAMP = "RC4-2026-07-23T04:47Z-p0-roundstart-course-fix";
