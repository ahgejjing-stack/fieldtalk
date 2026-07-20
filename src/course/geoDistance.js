/**
 * geoDistance.js
 * ------------------------------------------------------------------
 * Course Reference Prototype §5/§6 — pure coordinate distance math.
 * Deliberately has zero dependency on navigator.geolocation, Round Engine,
 * or any provider: it only ever takes two {latitude, longitude} objects
 * and returns a distance in meters, or null if the inputs aren't usable.
 *
 * "위치 계층 분리" principle: LocationProvider decides WHERE a coordinate
 * comes from (mock or real GPS hardware); this file only ever answers
 * "how far apart are these two points" and never asks where they came
 * from. Nothing here reads player/round state.
 * ------------------------------------------------------------------
 */

const EARTH_RADIUS_M = 6371000; // mean Earth radius, standard haversine constant

/** True if `c` is a plausible {latitude, longitude} pair. Doesn't check
 * whether the point is on land/sea or "real" in any deeper sense — only
 * that the numbers are in a valid coordinate range. */
export function isValidCoordinate(c) {
  return (
    !!c &&
    typeof c.latitude === "number" &&
    typeof c.longitude === "number" &&
    Number.isFinite(c.latitude) &&
    Number.isFinite(c.longitude) &&
    c.latitude >= -90 &&
    c.latitude <= 90 &&
    c.longitude >= -180 &&
    c.longitude <= 180
  );
}

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle distance between two coordinates, in meters.
 * Returns null (never a fabricated number) when either point is missing
 * or out of valid range — callers must treat null as "no distance
 * available", not "distance is 0".
 */
export function haversineDistanceM(a, b) {
  if (!isValidCoordinate(a) || !isValidCoordinate(b)) return null;

  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_M * c;
}

/** Rounds to the nearest meter — the same "whole meter" granularity every
 * other distance value in the app already uses. Does NOT clamp to
 * 1–1000m; that range restriction belongs to the caller that decides a
 * value is meant for display (see roundSelectors.js's use of
 * clampDistanceM from distanceCalculator.js) — this function only
 * reports the true geometric distance. */
export function roundDistanceM(meters) {
  if (typeof meters !== "number" || !Number.isFinite(meters)) return null;
  return Math.round(meters);
}
