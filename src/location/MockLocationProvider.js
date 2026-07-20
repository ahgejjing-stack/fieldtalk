/**
 * MockLocationProvider.js
 * ------------------------------------------------------------------
 * Course Reference Prototype §5 — "MockLocationProvider: Chromium
 * 검증용 고정 좌표". This is the LocationProvider actually exercised by
 * this Sprint's Playwright tests, since headless Chromium has no real
 * GPS hardware to report a position from.
 * ------------------------------------------------------------------
 */
import { LocationProvider } from "./LocationProvider.js";

export class MockLocationProvider extends LocationProvider {
  /** @param {{latitude: number, longitude: number} | null} fixedCoordinate */
  constructor(fixedCoordinate) {
    super();
    this.fixedCoordinate = fixedCoordinate ?? null;
  }

  async getCurrentPosition() {
    return this.fixedCoordinate;
  }

  /** Test helper — lets a Playwright/DEV control move the mock position
   * without constructing a new provider instance. */
  setFixedCoordinate(coordinate) {
    this.fixedCoordinate = coordinate ?? null;
  }
}
