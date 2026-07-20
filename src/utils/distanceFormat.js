/**
 * distanceFormat.js
 * ------------------------------------------------------------------
 * Small formatting helpers shared by DistanceCard.jsx and PlayerCard.jsx.
 *
 * TASK-006: the UI is only ever allowed to say "GPS (참고)" or "실측
 * (우선)" — never "레이저"/"음성"/"수동"/"APL"/etc. `formatSourceLabel()`
 * still exists (the internal `source` field itself is untouched per
 * TASK-006 §5 "내부 데이터 구조는 그대로 유지한다"), but nothing in this
 * file's user-facing output calls it anymore. It's kept around for
 * potential future dev-only debugging views.
 * ------------------------------------------------------------------
 */

const SOURCE_LABELS = {
  gps: "GPS",
  laser: "레이저",
  voice: "음성",
  manual: "수동",
  watch: "워치",
};

/** Not used by any user-facing string anymore (TASK-006) — kept for
 * potential future dev-only debugging views, since the underlying
 * `source` field itself is still tracked internally. */
export function formatSourceLabel(source) {
  return SOURCE_LABELS[source] || "알 수 없음";
}

/** "방금 전" / "N분 전" / "HH:MM" — deliberately coarse, this is a casual
 * round-tracking app, not a log viewer. */
export function formatRelativeTime(isoString) {
  if (!isoString) return "";
  const then = new Date(isoString).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  if (diffMs < 0) return "";
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "방금 전";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}분 전`;
  const d = new Date(then);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// TASK-006 §3: warn (but never block sharing) when the measured value drifts
// 8m or more from the GPS reference.
export const GPS_DIFF_WARNING_THRESHOLD_M = 8;

/** Returns the warning string when GPS and the measured value differ by
 * >= 8m, or null when they're close enough (including exactly equal, in
 * which case no message is shown at all per TASK-006 §3). The message
 * always includes the actual diff so the person can judge how far off
 * they are, not just that they are off. */
export function getGpsDiffWarning(gpsValueM, measuredValueM) {
  if (typeof gpsValueM !== "number" || typeof measuredValueM !== "number") return null;
  const diff = Math.abs(measuredValueM - gpsValueM);
  if (diff >= GPS_DIFF_WARNING_THRESHOLD_M) {
    return `GPS 참고거리와 ${diff}m 차이가 있습니다. 실측값을 다시 확인해 주세요.`;
  }
  return null;
}

/**
 * Short (1-2 word) version of describeManualReading()'s label, for the
 * compact companion GPS grid where "핀 좌표 기반 계산값 145m" wouldn't fit
 * next to "GPS 143m" (TASK-009 §6). Same categories, terser text.
 */
export function shortLabelForCategory(category) {
  if (category === "measured") return "실측";
  if (category === "demo_estimate") return "추정";
  if (category === "coordinate_calc") return "좌표기반";
  return "";
}

export function resolvePlayerName(players, playerId) {
  if (!playerId) return null;
  const p = (players || []).find((pl) => pl.id === playerId);
  return p ? p.name : null;
}

/**
 * Builds a "재식 · 3분 전" style caption for a manual distance reading —
 * measurer and time only, no device/source terminology (TASK-006 §5).
 * Returns null if there's no reading yet.
 */
export function formatDistanceMeta(manualEntry, players) {
  if (!manualEntry || typeof manualEntry.valueM !== "number") return null;
  const parts = [];
  const measurerName = resolvePlayerName(players, manualEntry.measuredBy);
  if (measurerName) parts.push(measurerName);
  const time = formatRelativeTime(manualEntry.updatedAt);
  if (time) parts.push(time);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Classifies a manual reading into one of the categories the UI must keep
 * visually distinct:
 *   - "measured"        — this player's own laser/voice/manual reading
 *   - "coordinate_calc"  — calculated from REAL pin coordinates (not
 *                          reachable yet in this prototype — no real GPS —
 *                          but kept as a distinct, forward-compatible state:
 *                          `isEstimated: false` + a non-"self_measured" mode
 *                          would land here once real geodesic calc exists)
 *   - "demo_estimate"    — this prototype's mock-offset estimate
 *                          (`calculationMode: "demo_mock_offset"`)
 *   - "shared_reference"  — someone else's raw number, shared unchanged
 *                          because we don't have a real pin location fix
 * Returns null if there's no reading yet.
 */
export function describeManualReading(manual) {
  if (!manual || typeof manual.valueM !== "number") return null;
  if (manual.calculationMode === "self_measured") {
    return { category: "measured", label: "실측" };
  }
  if (manual.calculationMode === "shared_reference") {
    return { category: "shared_reference", label: "공유값(참고)" };
  }
  if (manual.calculationMode === "demo_mock_offset" || manual.isEstimated) {
    return { category: "demo_estimate", label: "추정값" };
  }
  // Any other non-estimated, non-self-measured mode is a real
  // coordinate/bearing-based calculation — not reachable in this prototype
  // yet, but structured so a future real implementation lands here
  // automatically instead of being mislabeled as a demo estimate.
  return { category: "coordinate_calc", label: "핀 좌표 기반 계산값" };
}
