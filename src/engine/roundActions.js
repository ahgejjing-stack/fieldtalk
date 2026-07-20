/**
 * roundActions.js
 * ------------------------------------------------------------------
 * Action type constants + plain action-creator functions for the Round
 * Engine reducer (src/engine/roundReducer.js). Every state change in the
 * app is required to flow through one of these — see docs/ROUND_ENGINE_v0.1.md.
 * ------------------------------------------------------------------
 */

export const ROUND_START = "ROUND_START";
export const ROUND_COMPLETE = "ROUND_COMPLETE";
export const HOLE_START = "HOLE_START";
export const HOLE_SET_STATUS = "HOLE_SET_STATUS";
export const HOLE_COMPLETE = "HOLE_COMPLETE";
export const NEXT_HOLE = "NEXT_HOLE";
export const PLAYER_SET_STATUS = "PLAYER_SET_STATUS";
export const PLAYER_SET_DISTANCE = "PLAYER_SET_DISTANCE";
export const PLAYER_SET_SCORE = "PLAYER_SET_SCORE";
export const PTT_START = "PTT_START";
export const PTT_STOP = "PTT_STOP";
export const SOUND_PLAYED = "SOUND_PLAYED";
export const SHOT_CREATE = "SHOT_CREATE";
export const SHOT_START = "SHOT_START";
export const SHOT_COMPLETE = "SHOT_COMPLETE";
export const SHOT_CANCEL = "SHOT_CANCEL";
export const TEAM_DISTANCE_SHARE = "TEAM_DISTANCE_SHARE";
export const HOLE_SET_GREEN_SELECTION = "HOLE_SET_GREEN_SELECTION";
export const HOLE_SET_PIN_LOCATION_STATUS = "HOLE_SET_PIN_LOCATION_STATUS";
export const PLAYER_SET_GPS_DISTANCE = "PLAYER_SET_GPS_DISTANCE";
export const PLAYER_SET_LOCATION = "PLAYER_SET_LOCATION";
export const COURSE_SNAPSHOT_APPLIED = "COURSE_SNAPSHOT_APPLIED";
export const COURSE_SNAPSHOT_APPLIED_WITH_HOLES = "COURSE_SNAPSHOT_APPLIED_WITH_HOLES";
export const ROUND_START_FROM_ROOM = "ROUND_START_FROM_ROOM";
export const ROUND_RESET = "ROUND_RESET";

export const roundStart = () => ({ type: ROUND_START });

export const roundComplete = () => ({ type: ROUND_COMPLETE });

export const holeStart = (holeNumber) => ({
  type: HOLE_START,
  payload: { holeNumber },
});

export const holeSetStatus = (holeNumber, status) => ({
  type: HOLE_SET_STATUS,
  payload: { holeNumber, status },
});

export const holeComplete = (holeNumber) => ({
  type: HOLE_COMPLETE,
  payload: { holeNumber },
});

export const nextHole = () => ({ type: NEXT_HOLE });

export const playerSetStatus = (playerId, activity, activityLabel) => ({
  type: PLAYER_SET_STATUS,
  payload: { playerId, activity, activityLabel },
});

/**
 * Sets a *single* player's manually-measured distance directly (no team
 * broadcast — for that, use teamDistanceShare()). Populates `distance.manual`,
 * never `distance.gps` — GPS readings go through playerSetGpsDistance().
 */
export const playerSetDistance = (playerId, valueM, opts = {}) => ({
  type: PLAYER_SET_DISTANCE,
  payload: {
    playerId,
    valueM,
    source: opts.source ?? "manual",
    measuredBy: opts.measuredBy ?? playerId,
  },
});

export const playerSetScore = (playerId, holeNumber, strokes) => ({
  type: PLAYER_SET_SCORE,
  payload: { playerId, holeNumber, strokes },
});

export const pttStart = (playerId) => ({
  type: PTT_START,
  payload: { playerId },
});

export const pttStop = (playerId) => ({
  type: PTT_STOP,
  payload: { playerId },
});

export const soundPlayed = (event) => ({
  type: SOUND_PLAYED,
  payload: event,
});

/**
 * Creates a new shot for a player. `holeNumber` defaults to the round's
 * current hole (resolved in the reducer, since the action creator itself
 * stays stateless). `type` defaults to "approach" — see
 * docs/SHOT_DISTANCE_ENGINE_v0.1.md for the full shot.type enum.
 */
export const shotCreate = ({ playerId, holeNumber = null, type = "approach", club = null, distanceToTargetM = null }) => ({
  type: SHOT_CREATE,
  payload: { playerId, holeNumber, type, club, distanceToTargetM },
});

export const shotStart = (shotId) => ({
  type: SHOT_START,
  payload: { shotId },
});

export const shotComplete = (shotId) => ({
  type: SHOT_COMPLETE,
  payload: { shotId },
});

export const shotCancel = (shotId) => ({
  type: SHOT_CANCEL,
  payload: { shotId },
});

/**
 * Shares one player's *manually measured* distance (laser/voice/manual —
 * never "gps", that's a separate always-on baseline, not something you
 * "share" as a discrete measurement event) with the whole team. Does NOT
 * touch anyone's `distance.gps` — only `distance.manual`.
 * @param {{ referencePlayerId: string, referenceDistanceM: number, source?: "laser"|"voice"|"manual"|"watch" }} payload
 */
export const teamDistanceShare = ({ referencePlayerId, referenceDistanceM, source = "manual", runtimeMode }) => ({
  type: TEAM_DISTANCE_SHARE,
  payload: { referencePlayerId, referenceDistanceM, source, runtimeMode },
});

/**
 * Sets which green/section a hole uses: "single" | "left" | "right" | "unknown".
 * This is course-layout metadata ONLY — it does NOT imply we know where the
 * pin actually is on that green. It never gates distance correction; see
 * holeSetPinLocationStatus() for that.
 */
export const holeSetGreenSelection = (holeNumber, greenSelection) => ({
  type: HOLE_SET_GREEN_SELECTION,
  payload: { holeNumber, greenSelection },
});

/**
 * Sets whether we actually have a location fix on the pin for a hole:
 * "unknown" | "center_only" | "coordinate_known" | "bearing_known".
 * Per-player distance correction is ONLY applied when this is
 * "coordinate_known" or "bearing_known" — see distanceCalculator.js.
 * Knowing the green selection (single/left/right) alone is NOT enough.
 */
export const holeSetPinLocationStatus = (holeNumber, locationStatus) => ({
  type: HOLE_SET_PIN_LOCATION_STATUS,
  payload: { holeNumber, locationStatus },
});

/**
 * Updates a player's GPS baseline distance (to green center) — the
 * "기본 참고값" that's always available, distinct from a manual laser/voice
 * measurement. Nothing currently calls this outside of the round seed, but
 * it's here so a future real-GPS integration has a stable action to dispatch
 * into without touching the reducer.
 */
export const playerSetGpsDistance = (playerId, valueM) => ({
  type: PLAYER_SET_GPS_DISTANCE,
  payload: { playerId, valueM },
});

/**
 * Course Reference Prototype §5/§7 — records a player's live coordinate
 * (from a LocationProvider — Mock in tests, Browser in production).
 * Distinct from `playerSetGpsDistance`: that action sets the pre-existing
 * MOCK GPS number (roundSeed.js's GPS_BASE_M path, left completely
 * untouched by this Sprint); this one feeds selectPlayerGps()'s real
 * coordinate math instead. The two paths never mix.
 */
export const playerSetLocation = (playerId, latitude, longitude) => ({
  type: PLAYER_SET_LOCATION,
  payload: { playerId, latitude, longitude },
});

/**
 * Course Reference Prototype §7 — applies a normalized CourseReference
 * (see src/course/normalizeCourse.js) as the Round's course snapshot, or
 * clears it with `null`. The reducer deep-copies this so later mutations
 * to the Provider's source data can never retroactively change an
 * already-applied Round (Scenario E, COURSE_REFERENCE_PROTOTYPE spec).
 */
export const courseSnapshotApplied = (courseSnapshot) => ({
  type: COURSE_SNAPSHOT_APPLIED,
  payload: { courseSnapshot },
});

/**
 * Integration Hardening v0.2 §5 — Pre-Round "START"-time action: applies a
 * CourseReference snapshot AND merges its PAR/greenCenter into the Round's
 * existing hole objects (keyed by hole number), AND sets the starting
 * hole. Distinct from courseSnapshotApplied() (Prototype v0.1's DEV
 * control), which only ever set the snapshot field and never touched
 * round.holes — kept exactly as it was so that quick GPS-only DEV testing
 * doesn't unexpectedly jump the current hole or rewrite PAR values.
 */
export const courseSnapshotAppliedWithHoles = (courseSnapshot, startHoleNumber) => ({
  type: COURSE_SNAPSHOT_APPLIED_WITH_HOLES,
  payload: { courseSnapshot, startHoleNumber },
});

/**
 * Round Room Foundation v0.1 §6 — the single explicit START action.
 * `preBuiltRound` is the complete, already-validated Round object produced
 * by buildInitialRoundFromRoom.js — the reducer just replaces state
 * wholesale with it (one atomic step), rather than the UI sequencing
 * several smaller dispatches (player snapshot, then course, then hole
 * status, then round.status, ...) that could leave a half-built Round
 * behind if something in between went wrong.
 */
export const roundStartFromRoom = (preBuiltRound) => ({
  type: ROUND_START_FROM_ROOM,
  payload: { preBuiltRound },
});

/** TASK-010 Review §3: fires when leaving a COMPLETED round via the
 * completion screen's "홈으로" button — clears the finished round so the
 * next "라운드 시작" doesn't silently reactivate stale hole-18 data (old
 * scores, old course, wrong hole number). Never fired by the ordinary
 * back-arrow, which should preserve an in-progress round untouched. */
export const roundReset = () => ({ type: ROUND_RESET });

