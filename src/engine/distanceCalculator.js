/**
 * distanceCalculator.js
 * ------------------------------------------------------------------
 * Pure calculation layer for the Shot & Smart Distance Engine.
 * No GPS, no React, no DOM — just a deterministic transform from one
 * player's *measured* distance reading (laser/voice/manual) into a
 * per-player team distance list.
 *
 * IMPORTANT correction: knowing which green a hole uses (single / left /
 * right) is NOT the same as knowing where the pin actually is. Those are
 * two separate facts:
 *
 *   - greenSelection   — which green/section (course layout metadata)
 *   - pinLocationStatus — do we actually have a real fix on the pin
 *                         ("unknown" | "center_only" | "coordinate_known"
 *                          | "bearing_known")
 *
 * Per-player correction is ONLY allowed when pinLocationStatus is
 * "coordinate_known" or "bearing_known". Everything else — including
 * knowing it's a "left green" — shares the raw measured number unchanged.
 * Even when correction *is* allowed, this prototype still has no real
 * player GPS positions, so the "correction" is always the same mock-offset
 * demo math — which is why every corrected result is explicitly flagged
 * `calculationMode: "demo_mock_offset"` and `isEstimated: true` rather than
 * being presented as a real calculation.
 * ------------------------------------------------------------------
 */

const MIN_DISTANCE_M = 1;
const MAX_DISTANCE_M = 1000;

export const PIN_LOCATION_STATUSES_ALLOWING_CORRECTION = ["coordinate_known", "bearing_known"];

// Exported (was module-private) so roundSelectors.js's live GPS-delta
// correction (거리 공유 계산 규칙 정정) can reuse the exact same 1–1000m
// clamp rule instead of re-implementing it — "이전 구현이 존재한다면 새로
// 만들지 말고 복구·재사용해 주세요". Behavior is completely unchanged for
// every existing caller in this file.
export function clampDistanceM(value) {
  return Math.min(MAX_DISTANCE_M, Math.max(MIN_DISTANCE_M, value));
}
function clamp(value) {
  return clampDistanceM(value);
}

/** True only when we actually have a location fix on the pin — never true
 * just because the green section (single/left/right) is known. */
export function canApplyPositionCorrection(pinLocationStatus) {
  return PIN_LOCATION_STATUSES_ALLOWING_CORRECTION.includes(pinLocationStatus);
}

/**
 * @param {{
 *   players: Array,
 *   referencePlayerId: string,
 *   referenceDistanceM: number,
 *   pinLocationStatus?: "unknown" | "center_only" | "coordinate_known" | "bearing_known",
 * }} input
 * @returns {{
 *   ok: true,
 *   results: Array<{
 *     playerId: string,
 *     distanceM: number,
 *     offsetM: number,
 *     calculationMode: "self_measured" | "demo_mock_offset" | "shared_reference",
 *     isEstimated: boolean,
 *   }>,
 *   referenceDistanceM: number,
 * } | { ok: false, reason: string }}
 */
export function calculateTeamDistances({
  players,
  referencePlayerId,
  referenceDistanceM,
  pinLocationStatus = "unknown",
}) {
  if (!Array.isArray(players) || players.length === 0) {
    return { ok: false, reason: "no_players" };
  }
  if (!referencePlayerId) {
    return { ok: false, reason: "missing_reference_player" };
  }
  const referencePlayer = players.find((p) => p && p.id === referencePlayerId);
  if (!referencePlayer) {
    return { ok: false, reason: "reference_player_not_found" };
  }
  if (typeof referenceDistanceM !== "number" || !Number.isFinite(referenceDistanceM)) {
    return { ok: false, reason: "invalid_distance" };
  }

  // Rule: round the reference reading first, then clamp to 1–1000m.
  const roundedReference = clamp(Math.round(referenceDistanceM));
  const canCorrect = canApplyPositionCorrection(pinLocationStatus);

  const results = players.map((player) => {
    if (player.id === referencePlayerId) {
      return {
        playerId: player.id,
        distanceM: roundedReference,
        offsetM: 0,
        calculationMode: "self_measured",
        isEstimated: false,
      };
    }

    if (!canCorrect) {
      // No real fix on the pin — sharing the raw measured number as a
      // common reference value, NOT as a calculated personal distance.
      return {
        playerId: player.id,
        distanceM: roundedReference,
        offsetM: 0,
        calculationMode: "shared_reference",
        isEstimated: false,
      };
    }

    // We have a location fix, but this prototype still has no real player
    // GPS — so this is a labeled demo estimate, not a real calculation.
    const offsetM = typeof player.mockDistanceOffsetM === "number" ? player.mockDistanceOffsetM : 0;
    const distanceM = clamp(Math.round(roundedReference + offsetM));
    return {
      playerId: player.id,
      distanceM,
      offsetM,
      calculationMode: "demo_mock_offset",
      isEstimated: true,
    };
  });

  return { ok: true, results, referenceDistanceM: roundedReference };
}
