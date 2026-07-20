/**
 * LocationProvider.js
 * ------------------------------------------------------------------
 * Course Reference Prototype §5 — "위치 계층 분리".
 *
 * distanceCalculator/geoDistance never call navigator.geolocation
 * directly; they only ever receive a plain {latitude, longitude} object.
 * This contract is what stands between "where did this coordinate come
 * from" (Mock for testing, Browser for real GPS hardware) and "how far
 * apart are two coordinates" (geoDistance.js, which doesn't know or care
 * which LocationProvider produced its inputs).
 * ------------------------------------------------------------------
 */
export class LocationProvider {
  /**
   * @returns {Promise<{latitude: number, longitude: number} | null>}
   *   null when no location is available (permission denied, no fix yet,
   *   unsupported environment) — never a fabricated coordinate.
   */
  async getCurrentPosition() {
    throw new Error("LocationProvider.getCurrentPosition() not implemented");
  }
}
