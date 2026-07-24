/**
 * roundStorage.js
 * ------------------------------------------------------------------
 * localStorage persistence for the active round. Per ROUND_ENGINE_v0.1.md:
 *   - key: fieldtalk.round.active.v1
 *   - MVP: no debounce, save on every change
 *   - corrupted/invalid data falls back to roundSeed
 * ------------------------------------------------------------------
 */

import { DEFAULT_MOCK_OFFSETS_M, GPS_BASE_M } from "../data/roundSeed.js";

export const ROUND_STORAGE_KEY = "fieldtalk.round.active.v1";
const EXPECTED_SCHEMA_VERSION = 1;

// Runtime Identity v0.4 §12 — "identity별 storage key namespace". The
// DEFAULT identity (재식, or no userId passed — every pre-v0.4 call site)
// keeps using ROUND_STORAGE_KEY unchanged, so existing Demo data is never
// orphaned. Only a non-default identity gets a namespaced key, so
// switching identity in DEV testing never mixes one person's Round into
// another's.
import { DEFAULT_IDENTITY_USER_ID } from "../identity/runtimeIdentity.js";
function resolveRoundStorageKey(userId) {
  if (!userId || userId === DEFAULT_IDENTITY_USER_ID) return ROUND_STORAGE_KEY;
  return `${ROUND_STORAGE_KEY}:${userId}`;
}

/** Minimal structural check — enough to catch corruption/old shapes without
 * being a full schema validator. */
function looksLikeRound(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    typeof value.status === "string" &&
    typeof value.currentHoleNumber === "number" &&
    Array.isArray(value.holes) &&
    Array.isArray(value.players) &&
    value.course &&
    typeof value.course.totalHoles === "number"
  );
}

const KNOWN_GREEN_SELECTIONS = ["single", "left", "right", "unknown"];
const KNOWN_PIN_LOCATION_STATUSES = ["unknown", "center_only", "coordinate_known", "bearing_known"];

function clampGpsRange(n) {
  return Math.min(1000, Math.max(1, Math.round(n)));
}

/**
 * TASK-009 Regression Fix: earlier hydration always left `distance.gps.valueM`
 * as `null` for any saved round from before the GPS/manual split, and never
 * backfilled it afterward — so a browser that still had localStorage from an
 * older session would show "-" for GPS forever (own GPS, companion GPS, and
 * — since every diff/share calculation is gated on a real GPS number — the
 * "팀에 공유" button would never appear either, since GPS vs. measured always
 * looked like they matched at `0 vs 0`). This computes the exact same mock
 * GPS baseline the seed itself uses, so migrated sessions get a real number
 * instead of a permanent placeholder.
 */
function computeMockGpsValueM(playerId) {
  const offset = DEFAULT_MOCK_OFFSETS_M[playerId] ?? 0;
  return clampGpsRange(GPS_BASE_M + offset);
}

/** True if this looks like a pre-distance-model-v2 flat `{valueM, source,
 * updatedAt, referencePlayerId}` object rather than the current
 * `{gps, manual}` shape. */
function isLegacyFlatDistance(distance) {
  return (
    distance &&
    typeof distance === "object" &&
    !("gps" in distance) &&
    !("manual" in distance) &&
    ("valueM" in distance || "source" in distance)
  );
}

/**
 * Remaps a `manual.calculationMode` value (plus derives `isEstimated`) from
 * any previous naming this app has used:
 *   - "reference"    (v1)         -> self_measured, isEstimated: false
 *   - "mock_offset"  (v2, flawed) -> demo_mock_offset, isEstimated: true
 *   - "shared_raw"   (v2, flawed) -> shared_reference, isEstimated: false
 *   - already-current values pass through unchanged.
 * The v2 naming was flawed because it gated correction on whether the green
 * section (single/left/right) was known, not on whether the pin's actual
 * location was known — see CHANGELOG.md. This only renames/tags historical
 * data; it does not retroactively decide whether that old correction
 * *should* have applied.
 */
function migrateManualCalculationMode(manual) {
  if (!manual) return manual;
  const MODE_MAP = {
    reference: "self_measured",
    self_measured: "self_measured",
    mock_offset: "demo_mock_offset",
    demo_mock_offset: "demo_mock_offset",
    shared_raw: "shared_reference",
    shared_reference: "shared_reference",
  };
  const ESTIMATED_BY_MODE = {
    self_measured: false,
    demo_mock_offset: true,
    shared_reference: false,
  };
  const mappedMode = manual.calculationMode != null ? MODE_MAP[manual.calculationMode] ?? null : null;
  const isEstimated =
    typeof manual.isEstimated === "boolean"
      ? manual.isEstimated
      : mappedMode != null
      ? ESTIMATED_BY_MODE[mappedMode]
      : false;
  return {
    ...manual,
    calculationMode: mappedMode ?? manual.calculationMode ?? null,
    isEstimated,
  };
}

/** Migrates one player's distance field from the old flat shape (used
 * through the first TASK-004 delivery) to the current `{gps, manual}` split
 * — see CHANGELOG.md for the requirement change that introduced this. Old
 * data becomes a `manual` reading (it's exactly what it was: someone's
 * measured/shared number), with a fresh empty `gps` baseline since that
 * concept didn't exist yet in the old shape. */
function migrateLegacyDistance(distance, playerId) {
  const gpsFallback = {
    valueM: computeMockGpsValueM(playerId),
    source: "gps",
    updatedAt: null,
    measuredBy: null,
  };

  if (!distance) {
    return {
      gps: gpsFallback,
      manual: {
        valueM: null,
        source: null,
        updatedAt: null,
        measuredBy: null,
        referencePlayerId: null,
        calculationMode: null,
        isEstimated: false,
      },
    };
  }
  if (isLegacyFlatDistance(distance)) {
    const referencePlayerId = distance.referencePlayerId ?? null;
    const wasCalculatedForSomeoneElse = referencePlayerId && referencePlayerId !== playerId;
    return {
      gps: gpsFallback,
      manual: {
        valueM: typeof distance.valueM === "number" ? distance.valueM : null,
        source: distance.source ?? "manual",
        updatedAt: distance.updatedAt ?? null,
        measuredBy: referencePlayerId ?? playerId,
        referencePlayerId,
        calculationMode: wasCalculatedForSomeoneElse ? "demo_mock_offset" : "self_measured",
        isEstimated: !!wasCalculatedForSomeoneElse,
      },
    };
  }
  // Already the {gps, manual} shape — make sure both sub-objects exist, any
  // old calculationMode naming gets remapped, and a missing/null GPS value
  // gets backfilled rather than left permanently blank.
  const emptyManual = {
    valueM: null,
    source: null,
    updatedAt: null,
    measuredBy: null,
    referencePlayerId: null,
    calculationMode: null,
    isEstimated: false,
  };
  const hasRealGpsValue = typeof distance.gps?.valueM === "number";
  return {
    gps: hasRealGpsValue ? distance.gps : { ...gpsFallback, ...(distance.gps ?? {}), valueM: gpsFallback.valueM },
    manual: distance.manual ? migrateManualCalculationMode(distance.manual) : emptyManual,
  };
}

/**
 * Normalizes a hole's `pin` object into the current `{ latitude, longitude,
 * greenSelection, locationStatus }` shape.
 *
 * IMPORTANT: older saved data (from the previous TASK-004 revision) had a
 * single `pin.position` field that conflated "which green" with "do we know
 * where the pin is" — the exact mistake this revision fixes. When migrating
 * that old field, we deliberately do NOT assume a known green section also
 * means the pin's real location is known: `greenSelection` inherits the old
 * value, but `locationStatus` always starts at "unknown" unless the current
 * (already-correct) shape says otherwise. This is a genuine behavior change
 * for old saves — holes that used to get per-player correction from a bare
 * "single/left/right" value will now correctly share a raw reference value
 * until the person explicitly sets a real pin location status.
 */
function migrateHolePin(pin) {
  const latitude = pin?.latitude ?? null;
  const longitude = pin?.longitude ?? null;

  if (pin && typeof pin.locationStatus === "string") {
    // Already the current shape.
    return {
      latitude,
      longitude,
      greenSelection: KNOWN_GREEN_SELECTIONS.includes(pin.greenSelection) ? pin.greenSelection : "unknown",
      locationStatus: KNOWN_PIN_LOCATION_STATUSES.includes(pin.locationStatus) ? pin.locationStatus : "unknown",
    };
  }

  // Old shape: single `position` field (or nothing at all).
  const oldPosition = pin?.position;
  const greenSelection = KNOWN_GREEN_SELECTIONS.includes(oldPosition) ? oldPosition : "unknown";
  return {
    latitude,
    longitude,
    greenSelection,
    // Conservative on purpose — see doc comment above.
    locationStatus: "unknown",
  };
}

/**
 * Backfills fields introduced after a round was first saved (TASK-004 added
 * `shots`, `lastDistanceShare`, `mockDistanceOffsetM`; later revisions split
 * `distance` into `{gps, manual}` and then split `pin.position` into
 * `{greenSelection, locationStatus}`) so older saved rounds keep working
 * without a full migration system — see docs/TECHNICAL_DEBT.md (TD-004).
 */
function hydrateRound(round) {
  return {
    ...round,
    shots: Array.isArray(round.shots) ? round.shots : [],
    lastDistanceShare: round.lastDistanceShare ?? null,
    holes: (round.holes || []).map((h) => ({
      ...h,
      pin: migrateHolePin(h.pin),
    })),
    players: (round.players || []).map((p) => ({
      ...p,
      mockDistanceOffsetM:
        typeof p.mockDistanceOffsetM === "number"
          ? p.mockDistanceOffsetM
          : DEFAULT_MOCK_OFFSETS_M[p.id] ?? 0,
      distance: migrateLegacyDistance(p.distance, p.id),
    })),
  };
}


/**
 * RC4 — legacy demo state 판별.
 * ------------------------------------------------------------------
 * 이전 빌드는 앱 시작 시 무조건 createRoundSeed()(round_demo_001, active,
 * 데모 4명)로 초기화했고, RoundProvider의 자동 저장이 그 값을 그대로
 * localStorage에 기록했다. 그래서 새 빌드를 배포해도 기존 기기에서는
 * 사용자가 아무것도 하지 않은 데모 상태가 복원된다.
 *
 * 여기서 폐기 대상은 "이전 빌드가 자동 생성한, 손대지 않은 데모 상태"
 * 뿐이다. 사용자가 실제로 플레이한 흔적(스코어/샷/이벤트/홀 진행)이
 * 하나라도 있으면 사용자의 데이터이므로 보존한다.
 */
const LEGACY_DEMO_PLAYER_IDS = ["player_jaesik", "player_jaegeun", "player_gwangcheon", "player_haeran"];

export function isLegacyDemoRound(round) {
  if (!round) return false;
  // 1) 이전 빌드의 데모 시드 식별자 + 상태
  if (round.id !== "round_demo_001") return false;
  if (round.status !== "active") return false;
  // 2) 네트워크 라운드가 아님 (room에 속하지 않음)
  if (round.roomId) return false;
  if (round.isNetworkBaseline === true) return false;
  // 3) 플레이어 구성이 정확히 기존 데모 4인
  const ids = (round.players ?? []).map((p) => p.id);
  if (ids.length !== LEGACY_DEMO_PLAYER_IDS.length) return false;
  if (!LEGACY_DEMO_PLAYER_IDS.every((id) => ids.includes(id))) return false;
  // 4) 사용자가 플레이한 흔적이 없음 — 있으면 사용자의 데이터이므로 보존
  if ((round.shots ?? []).length > 0) return false;
  if ((round.events ?? []).length > 0) return false;
  if (round.lastDistanceShare) return false;
  if ((round.currentHoleNumber ?? 1) !== 1) return false;
  const anyScore = (round.holes ?? []).some(
    (h) => h.scores && Object.keys(h.scores).length > 0
  );
  if (anyScore) return false;
  const anyHoleProgress = (round.holes ?? []).some(
    (h) => h.number !== 1 && h.status && h.status !== "pending"
  );
  if (anyHoleProgress) return false;
  return true;
}

export function loadRound(userId) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(resolveRoundStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.schemaVersion !== EXPECTED_SCHEMA_VERSION) return null;
    if (!looksLikeRound(parsed)) return null;
    const hydrated = hydrateRound(parsed);
    // RC4 — legacy demo state migration. 이전 빌드가 자동 저장한 손대지
    // 않은 데모 라운드만 선별 폐기한다. null을 반환하면 호출부(init)의
    // `?? createIdleRoundState()`가 평가되어 idle 상태로 시작하고,
    // RoundProvider의 자동 저장이 그 idle 상태를 기록한다.
    // schema 전체를 올려 모든 사용자의 라운드를 일괄 삭제하지 않는다.
    if (isLegacyDemoRound(hydrated)) {
      // eslint-disable-next-line no-console
      console.log("[ROUND MIGRATION] legacy demo state cleared");
      try {
        window.localStorage.removeItem(resolveRoundStorageKey(userId));
      } catch {
        /* 삭제 실패해도 null 반환으로 idle 시작은 보장된다 */
      }
      return null;
    }
    return hydrated;
  } catch (err) {
    // Corrupted JSON or anything else unexpected — caller falls back to seed.
    return null;
  }
}

export function saveRound(round, userId) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(resolveRoundStorageKey(userId), JSON.stringify(round));
  } catch (err) {
    // Storage full / disabled (e.g. private browsing) — fail silently, this
    // is a nice-to-have persistence layer, not critical to app function.
  }
}

export function clearRound(userId) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.removeItem(resolveRoundStorageKey(userId));
  } catch (err) {
    /* ignore */
  }
}
