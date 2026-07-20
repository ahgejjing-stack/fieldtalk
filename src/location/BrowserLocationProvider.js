/**
 * BrowserLocationProvider.js
 * ------------------------------------------------------------------
 * Course Reference Prototype §5 — real navigator.geolocation-backed
 * LocationProvider. This is the production path; MockLocationProvider
 * is what this Sprint's automated tests actually exercise, since
 * headless Chromium has no GPS hardware.
 *
 * navigator.geolocation itself requires a secure context (HTTPS, or
 * localhost during development) — on plain HTTP it's simply unavailable,
 * which this class treats the same as "no location available" (null),
 * never as a fabricated coordinate or a thrown error the caller has to
 * catch.
 * ------------------------------------------------------------------
 */
import { LocationProvider } from "./LocationProvider.js";

export class BrowserLocationProvider extends LocationProvider {
  /** @param {{timeoutMs?: number}} [options] */
  constructor(options = {}) {
    super();
    this.timeoutMs = options.timeoutMs ?? 8000;
  }

  async getCurrentPosition() {
    if (typeof window === "undefined" || !window.isSecureContext) {
      // HTTPS/localhost required — plain HTTP has no geolocation at all.
      return null;
    }
    if (!("geolocation" in navigator)) {
      return null;
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        () => {
          // Permission denied, position unavailable, or timeout — all
          // treated as "no location", never a fabricated fallback value.
          resolve(null);
        },
        { timeout: this.timeoutMs, maximumAge: 0 }
      );
    });
  }
}
