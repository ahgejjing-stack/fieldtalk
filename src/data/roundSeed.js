/**
 * roundSeed.js
 * ------------------------------------------------------------------
 * Initial Round Engine state, shaped per:
 *   - docs/ROUND_ENGINE_v0.1.md   (Round / Hole schema)
 *   - docs/PLAYER_STATE_v0.1.md   (Player schema)
 *   - docs/schemas/round.example.json
 *
 * This mirrors the same demo scenario the static prototype used to hardcode
 * (레이크사이드 CC, hole 7, four players) so the UI looks identical on first
 * load, but now lives in one place instead of being scattered across
 * components.
 *
 * Distance model: every player always has a `distance.gps` baseline (mock
 * "distance to green center" — always on, never overwritten by a manual
 * reading). Separately, `distance.manual` holds the most recent laser/voice/
 * manual measurement to the actual pin, if any. The two never overwrite each
 * other — see src/engine/roundReducer.js.
 * ------------------------------------------------------------------
 */

const NOW_ISO = () => new Date().toISOString();

/** Build the 18-hole array. Only hole 7 gets "real" demo data; the rest are
 * pending placeholders so NEXT_HOLE has somewhere to go.
 *
 * Hole 7 starts with greenSelection "single" (course layout: one green) AND
 * pinLocationStatus "unknown" — the app's default, first-run behavior is to
 * share the reference player's laser reading as a plain team-wide reference
 * value, NOT a per-player corrected estimate. A person can raise the
 * location-status tier explicitly in the UI to opt into demo correction —
 * see src/components/DistanceCard.jsx. */
/** A bare "not started" hole — the exact shape buildHoles() already used
 * for every hole except the demo's special hole 7. Exported so the
 * Room-based round initializer (buildInitialRoundFromRoom.js) can build a
 * real 18-hole set without duplicating this shape or pulling in hole 7's
 * hardcoded demo wind/PAR data. */
export function buildPendingHole(n) {
  return {
    number: n,
    par: 4,
    courseDistanceM: null,
    status: "pending",
    pin: { latitude: null, longitude: null, greenSelection: "unknown", locationStatus: "unknown" },
    wind: {
      speedMps: null,
      directionDeg: null,
      relativeToPin: "unknown",
      source: "mock",
    },
    startedAt: null,
    completedAt: null,
  };
}

export function buildHoles() {
  const holes = [];
  for (let n = 1; n <= 18; n++) {
    if (n === 1) {
      holes.push({
        number: 1,
        par: 4,
        courseDistanceM: 356,
        status: "playing",
        pin: {
          latitude: null,
          longitude: null,
          // "single" | "left" | "right" | "unknown" — which green/section.
          greenSelection: "single",
          // "unknown" | "center_only" | "coordinate_known" | "bearing_known"
          // — do we actually have a location fix on the pin. This, not
          // greenSelection, is what gates per-player distance correction.
          // Defaults to "unknown" — see doc comment above.
          locationStatus: "unknown",
        },
        wind: {
          speedMps: 2.3,
          directionDeg: 225,
          relativeToPin: "headwind",
          source: "mock",
        },
        startedAt: NOW_ISO(),
        completedAt: null,
      });
    } else {
      holes.push(buildPendingHole(n));
    }
  }
  return holes;
}

// Fixed per-player mock distance offsets (see
// docs/SHOT_DISTANCE_ENGINE_v0.1.md "프로토타입 계산 규칙"). Exported so
// roundStorage.js can backfill this field when hydrating older saved data,
// and reused below to derive plausible per-player GPS baselines too, without
// duplicating the numbers in more than one place.
export const DEFAULT_MOCK_OFFSETS_M = {
  player_jaesik: 0,
  player_jaegeun: 10,
  player_gwangcheon: -4,
  player_haeran: 1,
};

// Mock "distance to green center" baseline before per-player offset — GPS
// only ever gives you the green center, not the exact pin, which is exactly
// why it's a separate, coarser number from a laser/voice pin measurement.
// Exported so roundStorage.js can backfill a real GPS value (instead of
// leaving it permanently null) for sessions whose saved data predates the
// GPS/manual split — see TASK-009 Regression Fix.
export const GPS_BASE_M = 136;

function clamp1to1000(n) {
  return Math.min(1000, Math.max(1, Math.round(n)));
}

function makePlayer({
  id,
  name,
  pronunciation,
  role,
  activity,
  activityLabel,
  color,
  manual,
  scoreByHole,
  watchType,
  batteryPercent,
}) {
  const gpsValueM = clamp1to1000(GPS_BASE_M + (DEFAULT_MOCK_OFFSETS_M[id] ?? 0));
  return {
    id,
    name,
    displayName: name,
    pronunciation,
    role,
    connection: "online",
    activity,
    // activityLabel is an FIELDTALK-only display extension (not part of the
    // minimal schema in PLAYER_STATE_v0.1.md) so the UI can keep its richer
    // Korean copy ("세컨샷 준비" etc.) while `activity` itself stays inside
    // the documented enum for engine/selector logic.
    activityLabel,
    communication: {
      isSpeaking: false,
      speakingSince: null,
      lastSpokeAt: null,
    },
    distance: {
      // Always-on baseline reference — "기본 참고값" (req #1). Never
      // overwritten by a manual reading; only playerSetGpsDistance() touches
      // this, which nothing calls yet in this MVP beyond the seed itself.
      gps: {
        valueM: gpsValueM,
        source: "gps",
        updatedAt: NOW_ISO(),
        measuredBy: null,
      },
      // Precise laser/voice/manual measurement to the actual pin, if any.
      // Kept as a *separate* field from `gps` on purpose (req #4).
      manual: manual ?? {
        valueM: null,
        source: null,
        updatedAt: null,
        measuredBy: null,
        referencePlayerId: null,
        calculationMode: null,
        isEstimated: false,
      },
    },
    // TASK-004: prototype-only stand-in for real GPS-derived offsets — see
    // src/engine/distanceCalculator.js and docs/TECHNICAL_DEBT.md (TD-003).
    mockDistanceOffsetM: DEFAULT_MOCK_OFFSETS_M[id] ?? 0,
    scoreByHole,
    devices: {
      phoneConnected: true,
      headphonesConnected: false,
      watchConnected: true,
      watchType,
      batteryPercent,
    },
    // UI-only field, not part of the shared/synced schema — see color usage
    // in components/*.jsx avatars.
    color,
    lastActivityAt: NOW_ISO(),
  };
}

export function createRoundSeed() {
  return {
    schemaVersion: 1,
    id: "round_demo_001",
    status: "active",
    course: {
      id: "course_demo",
      name: "레이크사이드 CC",
      totalHoles: 18,
    },
    currentHoleNumber: 1,
    startedAt: NOW_ISO(),
    completedAt: null,
    settings: {
      unit: "meter",
      soundMode: "fun",
      outputTargets: ["phone", "headphones", "watch"],
    },
    holes: buildHoles(),
    players: [
      makePlayer({
        id: "player_jaesik",
        name: "재식",
        pronunciation: "이재식",
        role: "host",
        activity: "ready",
        activityLabel: "세컨샷 준비",
        color: "#2FBE7F",
        // 재식 already lasered the pin before the round screen loads, so the
        // demo starts with a live manual reading to show off immediately.
        manual: {
          valueM: 132,
          source: "laser",
          updatedAt: NOW_ISO(),
          measuredBy: "player_jaesik",
          referencePlayerId: "player_jaesik",
          calculationMode: "self_measured",
          isEstimated: false,
        },
        scoreByHole: {},
        watchType: "apple_watch",
        batteryPercent: 78,
      }),
      makePlayer({
        id: "player_jaegeun",
        name: "재근",
        pronunciation: "이재근",
        role: "member",
        activity: "shot_complete",
        activityLabel: "티샷 완료",
        color: "#4FA8FF",
        manual: null,
        scoreByHole: { 7: 4 },
        watchType: "galaxy_watch",
        batteryPercent: 61,
      }),
      makePlayer({
        id: "player_gwangcheon",
        name: "광천",
        pronunciation: "김광천",
        role: "member",
        activity: "moving",
        activityLabel: "페어웨이 이동 중",
        color: "#C9A24B",
        manual: null,
        scoreByHole: { 7: 3 },
        watchType: "none",
        batteryPercent: 34,
      }),
      makePlayer({
        id: "player_haeran",
        name: "해란",
        pronunciation: "박해란",
        role: "member",
        activity: "putting",
        activityLabel: "그린 위 · 퍼팅 준비",
        color: "#E37FBD",
        manual: null,
        scoreByHole: { 7: 5 },
        watchType: "apple_watch",
        batteryPercent: 89,
      }),
    ],
    events: [],
    shots: [],
    lastDistanceShare: null,
  };
}

export const ME_PLAYER_ID = "player_jaesik";

/**
 * createNetworkRoundState — RC4 CRITICAL REGRESSION FIX.
 * ------------------------------------------------------------------
 * A structurally-separate, DEMO-FREE baseline for network rounds. This
 * must NEVER be built by spreading/copying createRoundSeed() — a network
 * round begins from an empty network baseline and derives its players
 * ONLY from the live server roster (passed in as `players`, already
 * adapted via createRoundPlayersFromRoom in networkMode). No demo
 * players, no mock GPS, no seeded events/scores/distance/speaking.
 *
 * Used in two places:
 *   1. RoundProvider init, when networkCommunicationEnabled is on and no
 *      real round has been hydrated yet — so the very first render of a
 *      network session shows a clean/empty round, never the demo seed.
 *   2. As the shape reference for buildInitialRoundFromRoom's output
 *      (both produce the same clean network schema).
 *
 * @param {object} params
 * @param {string|null} [params.roomId]
 * @param {string|null} [params.roundId]  — server-authoritative when known
 * @param {string|null} [params.hostUserId]
 * @param {Array}       [params.players]  — already-adapted network players (may be empty)
 * @param {object|null} [params.course]
 * @param {number}      [params.startHole]
 * @param {string}      [params.status]   — "pending" until a real round_started lands
 */
export function createNetworkRoundState({
  roomId = null,
  roundId = null,
  hostUserId = null,
  players = [],
  course = null,
  startHole = 1,
  status = "pending",
} = {}) {
  const holeCount = course?.totalHoles ?? 18;
  const holes = [];
  for (let n = 1; n <= holeCount; n += 1) {
    holes.push(
      n === startHole ? { ...buildPendingHole(n), status: "playing", startedAt: NOW_ISO() } : buildPendingHole(n)
    );
  }
  return {
    schemaVersion: 1,
    // A network baseline is deliberately NOT `round_demo_001`. Until a real
    // round_started arrives it carries a `net_pending_` id so nothing in
    // the app mistakes it for either the demo seed or a live round.
    id: roundId ?? `net_pending_${Date.now()}`,
    // "pending" (not "active") so no hole/score/PTT logic treats an
    // un-hydrated network baseline as a running round.
    status,
    roomId,
    hostUserId,
    course: course ?? { id: null, name: null, totalHoles: holeCount },
    currentHoleNumber: startHole,
    startedAt: null,
    completedAt: null,
    settings: {
      unit: "meter",
      soundMode: "fun",
      outputTargets: ["phone", "headphones", "watch"],
    },
    holes,
    players, // ONLY the live roster — empty is valid (loading), demo is not
    events: [],
    shots: [],
    lastDistanceShare: null,
    // Explicit marker: demo effects must key off this being false.
    isNetworkBaseline: true,
  };
}
