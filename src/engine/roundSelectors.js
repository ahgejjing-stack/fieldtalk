/**
 * roundSelectors.js
 * ------------------------------------------------------------------
 * Pure selector functions over the Round Engine state. Components should
 * read data through these instead of reaching into `round.*` directly, so
 * the underlying shape can evolve without touching every component.
 * ------------------------------------------------------------------
 */

import {
  describeManualReading,
  formatDistanceMeta,
  formatRelativeTime,
  resolvePlayerName,
  shortLabelForCategory,
} from "../utils/distanceFormat.js";
import { clampDistanceM } from "./distanceCalculator.js";
import { haversineDistanceM, roundDistanceM } from "../course/geoDistance.js";
import { RUNTIME_MODES } from "../config/runtimeMode.js";

/**
 * Course Reference Prototype §6/§8 — resolves the GPS-shaped object
 * ({valueM, measuredBy, updatedAt}) a player should use right now, in
 * priority order:
 *   1. Real coordinates: round.courseSnapshot has a Level-2+ Green Center
 *      for the current hole AND this player has a live `location` — the
 *      distance is computed via the pure geoDistance.js haversine math
 *      (never fabricated; null in, null out).
 *   2. Demo mode only: the pre-existing mock path (player.distance.gps,
 *      GPS_BASE_M-based) — completely untouched by this Sprint, still
 *      exactly what it was.
 *   3. null — no GPS available at all (§9 "위치 정보 없음").
 *
 * Integration Hardening v0.2 §1: `options.runtimeMode` decides whether
 * step 2 is even allowed. Defaults to RUNTIME_MODES.DEMO so every caller
 * from before this Sprint (none of which pass a 3rd argument) keeps
 * behaving exactly as it did — this default is what makes the change
 * backward compatible rather than a silent behavior change.
 *
 * This is the ONE place both selectPlayerSummary() (live display) and
 * roundReducer.js's TEAM_DISTANCE_SHARE (share-time snapshot capture)
 * read a player's GPS from, so the real-coordinate path and the existing
 * delta-correction formula automatically stay in sync without the
 * formula itself changing at all (COURSE_REFERENCE_STRATEGY_v1.md §8).
 *
 * @param {*} round
 * @param {string} playerId
 * @param {{runtimeMode?: string}} [options]
 * @returns {{valueM: number, measuredBy: null, updatedAt: string} | null}
 */
export function selectPlayerGps(round, playerId, options = {}) {
  const runtimeMode = options.runtimeMode ?? RUNTIME_MODES.DEMO;
  if (!round) return null;
  const player = round.players.find((p) => p.id === playerId);
  if (!player) return null;

  const snapshot = round.courseSnapshot;
  if (snapshot && typeof snapshot.dataLevel === "number" && snapshot.dataLevel >= 2 && player.location) {
    const hole = snapshot.holes?.find((h) => h.number === round.currentHoleNumber);
    if (hole?.greenCenter) {
      const meters = haversineDistanceM(player.location, hole.greenCenter);
      const rounded = roundDistanceM(meters);
      if (rounded != null) {
        return {
          valueM: clampDistanceM(rounded),
          measuredBy: null,
          updatedAt: player.location.updatedAt,
        };
      }
    }
  }

  // §1: mock fallback is a Demo-only convenience. Production mode never
  // exposes GPS_BASE_M-derived numbers to the user, even if the existing
  // migration (roundStorage.js, untouched by this Sprint) has backfilled
  // player.distance.gps with a mock value — Production simply never reads
  // that field.
  if (runtimeMode === RUNTIME_MODES.PRODUCTION) {
    return null;
  }
  return player.distance?.gps ?? null;
}

export function selectCurrentHole(round) {
  if (!round) return null;
  return round.holes.find((h) => h.number === round.currentHoleNumber) || null;
}

export function selectPlayers(round) {
  if (!round) return [];
  return round.players;
}

export function selectPlayerById(round, playerId) {
  if (!round) return null;
  return round.players.find((p) => p.id === playerId) || null;
}

export function selectSpeakingPlayer(round) {
  if (!round) return null;
  return round.players.find((p) => p.communication.isSpeaking) || null;
}

/** Map of playerId -> strokes for the currently active hole. */
export function selectCurrentHoleScores(round) {
  if (!round) return {};
  const holeNumber = round.currentHoleNumber;
  const scores = {};
  for (const p of round.players) {
    if (p.scoreByHole && Object.prototype.hasOwnProperty.call(p.scoreByHole, holeNumber)) {
      scores[p.id] = p.scoreByHole[holeNumber];
    } else {
      scores[p.id] = null;
    }
  }
  return scores;
}

/* ---------------------------------------------------------------------
 * TASK-004 — Shot & Smart Distance Engine selectors
 * ------------------------------------------------------------------- */

export function selectShotsForCurrentHole(round) {
  if (!round) return [];
  return (round.shots || []).filter((s) => s.holeNumber === round.currentHoleNumber);
}

/** Most recent shot for a player (by sequence number), across any hole. */
export function selectLatestShotForPlayer(round, playerId) {
  if (!round) return null;
  const mine = (round.shots || []).filter((s) => s.playerId === playerId);
  if (mine.length === 0) return null;
  return mine.reduce((latest, s) => (s.sequence > latest.sequence ? s : latest), mine[0]);
}

export function selectLastDistanceShare(round) {
  if (!round) return null;
  return round.lastDistanceShare ?? null;
}

/** Per-player team distance results from the most recent share, or []. */
export function selectTeamDistances(round) {
  if (!round || !round.lastDistanceShare) return [];
  return round.lastDistanceShare.results || [];
}

/** Which green/section the current hole uses: "single" | "left" | "right" |
 * "unknown". Course-layout metadata only — see selectCanCorrectDistance()
 * for whether that metadata is enough to correct distances (it isn't, by
 * itself). */
export function selectGreenSelection(round) {
  const hole = selectCurrentHole(round);
  return hole?.pin?.greenSelection ?? "unknown";
}

/** Whether we actually have a location fix on the current hole's pin:
 * "unknown" | "center_only" | "coordinate_known" | "bearing_known". */
export function selectPinLocationStatus(round) {
  const hole = selectCurrentHole(round);
  return hole?.pin?.locationStatus ?? "unknown";
}

/** True only when the pin location status allows per-player distance
 * correction (coordinate_known / bearing_known). Deliberately does NOT
 * consider greenSelection — knowing it's a "left green" is not a location
 * fix on the pin. */
export function selectCanCorrectDistance(round) {
  const status = selectPinLocationStatus(round);
  return status === "coordinate_known" || status === "bearing_known";
}

/* ---------------------------------------------------------------------
 * Score aggregation — replaces the hardcoded "누계" values that used to
 * live in RoundScreen.jsx. All three selectors share one internal helper
 * so the sum is only computed once per call site.
 * ------------------------------------------------------------------- */

function computePlayerScoreSummary(round, playerId) {
  const player = round?.players?.find((p) => p.id === playerId);
  const scoreByHole = player?.scoreByHole;
  if (!scoreByHole) return { totalStrokes: 0, totalPar: 0, completedHoleCount: 0 };

  let totalStrokes = 0;
  let totalPar = 0;
  let completedHoleCount = 0;

  for (const [holeNumberKey, strokes] of Object.entries(scoreByHole)) {
    if (typeof strokes !== "number" || !Number.isFinite(strokes)) continue;
    const holeNumber = Number(holeNumberKey);
    const hole = round.holes?.find((h) => h.number === holeNumber);
    // Fall back to par 4 only if a hole somehow has no par on record — this
    // should never happen with the current seed, but keeps the sum honest
    // rather than silently dropping the hole from the total.
    const par = typeof hole?.par === "number" ? hole.par : 4;
    totalStrokes += strokes;
    totalPar += par;
    completedHoleCount += 1;
  }

  return { totalStrokes, totalPar, completedHoleCount };
}

/** Total strokes recorded so far for a player across all holes with a
 * score entered. Returns 0 (not null) if nothing has been entered yet —
 * callers that want a "-" placeholder should check
 * selectPlayerCompletedHoleCount() === 0 themselves. */
export function selectPlayerTotalStrokes(round, playerId) {
  return computePlayerScoreSummary(round, playerId).totalStrokes;
}

/** totalStrokes - totalPar, summed only over holes that actually have a
 * score entered (not all 18). */
export function selectPlayerTotalToPar(round, playerId) {
  const { totalStrokes, totalPar } = computePlayerScoreSummary(round, playerId);
  return totalStrokes - totalPar;
}

/** How many holes this player has an entered score for. */
export function selectPlayerCompletedHoleCount(round, playerId) {
  return computePlayerScoreSummary(round, playerId).completedHoleCount;
}

/* ---------------------------------------------------------------------
 * TASK-007 — Player Card as an "Event Board" instead of a "Status Board".
 * Deliberately reuses the *existing* round.events log (already populated
 * by PTT_STARTED, DISTANCE_SHARE_CREATED, SOUND_PLAYED, etc.) rather than
 * adding new state — this is a pure derived-data selector, same pattern
 * as every other selector in this file. See docs/PLAYER_EVENTS.md for the
 * full future event catalog / priority design (not all implemented yet).
 * ------------------------------------------------------------------- */

const DISTANCE_SHARE_EVENT_DURATION_MS = 5000;
const SOUND_REACTION_EVENT_DURATION_MS = 2000;

// Sound catalog categories that should surface as a brief PlayerCard event
// for whoever triggered them — mirrors GalleryPanel's own visible
// categories, so anything a person can actually tap there can show here.
const CARD_EVENT_SOUND_CATEGORIES = ["gallery", "team", "achievement"];

/**
 * What (if anything) a player's card should show right now, instead of a
 * persistent activity status. Priority, highest first:
 *   1. "speaking"     — live, while communication.isSpeaking is true
 *   2. "disconnected" — live, while connection !== "online"
 *   3. most recent still-unexpired timed event for this player
 *      ("distance_shared" 5s, "sound_reaction" 2s)
 *   4. null — caller should fall back to the default idle connection line.
 *
 * @param {object} round
 * @param {string} playerId
 * @param {number} [now] — inject for testability; defaults to Date.now().
 */
export function selectPlayerCardEvent(round, playerId, now = Date.now(), options = {}) {
  if (!round) return null;
  const player = round.players.find((p) => p.id === playerId);
  if (!player) return null;

  // Two Device Bidirectional Hardening v0.2 Part G: "Round의 기존 local
  // communication.isSpeaking은 네트워크 송수신 상태와 충돌하지 않도록
  // 역할을 정리" — when a caller supplies `speakingOverride` (RoundScreen.jsx
  // does this only for non-me players, only while network communication is
  // explicitly enabled), it REPLACES the raw isSpeaking flag for this
  // player instead of reading it directly, so a player is never shown
  // "말하는 중" to someone who isn't an actual target. Every existing
  // caller passes no options, so `speakingOverride === undefined` and this
  // falls through to the original, unchanged behavior.
  const isSpeaking = options.speakingOverride !== undefined ? options.speakingOverride : !!player.communication?.isSpeaking;

  if (isSpeaking) {
    return { type: "speaking", icon: "🎤", label: "말하는 중", continuous: true };
  }
  if (player.connection && player.connection !== "online") {
    return { type: "disconnected", icon: "🔴", label: "연결 끊김", continuous: true };
  }

  const candidates = [];
  for (const evt of round.events || []) {
    if (evt.actorPlayerId !== playerId) continue;

    if (evt.type === "DISTANCE_SHARE_CREATED") {
      const expireAt = new Date(evt.createdAt).getTime() + DISTANCE_SHARE_EVENT_DURATION_MS;
      if (now < expireAt) {
        const valueM = evt.payload?.referenceDistanceM;
        candidates.push({
          type: "distance_shared",
          icon: "📏",
          label: typeof valueM === "number" ? `${valueM}m 공유` : "실측 공유",
          createdAt: evt.createdAt,
        });
      }
    } else if (evt.type === "SOUND_PLAYED" && CARD_EVENT_SOUND_CATEGORIES.includes(evt.payload?.category)) {
      const expireAt = new Date(evt.createdAt).getTime() + SOUND_REACTION_EVENT_DURATION_MS;
      if (now < expireAt) {
        candidates.push({
          type: "sound_reaction",
          icon: "👏",
          label: evt.payload?.label || "리액션",
          createdAt: evt.createdAt,
        });
      }
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return candidates[0];
}

/**
 * Player First UI (Sprint 2): one combined summary per player instead of
 * two separately-computed sections ("동반자 GPS" + "참가자 상태"). This is
 * a pure combinator — it does not introduce any new judgment about what a
 * distance value means or what event takes priority; it just reuses the
 * exact same building blocks that already made those calls:
 *   - describeManualReading() / shortLabelForCategory() (distanceFormat.js)
 *     decide "실측" vs "추정" vs "좌표기반", unchanged.
 *   - formatDistanceMeta() builds "측정자 · 시각" — reused as-is for BOTH
 *     a manual reading AND a gps reading, since both share the same
 *     {valueM, measuredBy, updatedAt} shape (gps.measuredBy is always
 *     null, so the measurer name is simply omitted for GPS automatically).
 *   - selectPlayerCardEvent() decides whether a transient app-only event
 *     (말하는 중 / 연결 끊김 / 실측 공유 / 리액션) should override the line.
 *   - clampDistanceM() (distanceCalculator.js) — same 1–1000m rule the
 *     rest of the Distance Engine already uses, reused rather than
 *     reimplemented.
 *
 * 거리 공유 계산 규칙 정정: when a player's manual reading is
 * `shared_reference` (핀 위치 unknown/center_only), `distanceM` is no
 * longer a flat copy of the shared number, and no longer just falls back
 * to plain GPS either. Per Founder's corrected rule, it's a **live**
 * GPS-delta correction:
 *
 *   delta = referenceDistanceM - sharerGpsDistanceAtShareM   (frozen at
 *           share time, in round.lastDistanceShare — never drifts even if
 *           the sharer's own GPS updates afterward)
 *   playerAdjustedDistance = playerGpsDistanceM (CURRENT/live) + delta
 *
 * Because this reads the player's *current* `distance.gps.valueM` on every
 * call (not a frozen value), a companion's corrected distance updates
 * automatically the moment their own GPS changes — no separate
 * "recompute" action needed. The delta itself only ever comes from
 * `round.lastDistanceShare`, which is written once at share time and never
 * mutated, so it can't drift just because the sharer moved later.
 *
 * Priority for what fills `distanceM`, validated against every worked
 * example in the calculation-rule spec:
 *   1. This player's own real reading — "measured" (self_measured) or a
 *      real pin-aware personal calculation — "demo_estimate"/"coordinate_calc"
 *      (bearing_known/coordinate_known path, unchanged from before).
 *   2. `shared_reference` + a usable share snapshot + this player's own
 *      current GPS → the live delta correction above
 *      ("shared_adjusted_estimate").
 *   3. `shared_reference` but missing GPS or missing snapshot → never
 *      fabricate a number ("unavailable" — "GPS 필요" / "거리 계산 불가").
 *   4. No manual reading at all yet → own GPS baseline, unchanged.
 *
 * Deliberately returns a plain data object with no rendering decisions in
 * it, so a future Watch layout can call this exact same selector and lay
 * the same fields out differently (see PlayerCard.jsx's doc comment).
 *
 * @returns {{
 *   id: string,
 *   name: string,
 *   color: string,
 *   isSpeaking: boolean,
 *   distanceM: number | null,
 *   distanceCategory: "measured" | "demo_estimate" | "coordinate_calc" | "shared_adjusted_estimate" | "unavailable" | "gps" | null,
 *   distanceLine: string | null,   // e.g. "실측 · 광천 · 방금 전" / "실측 기준 추정 · 재식 · 방금 전" / "GPS · 12초 전" / "GPS 필요"
 *   secondaryGpsM: number | null,      // 거리 표시 정책 보완: GPS와 공유 보정값 동시 표시
 *   secondaryGpsLabel: string | null,  // e.g. "GPS 146m" — null whenever there's nothing to compare against (§예외 1)
 *   cardEvent: ReturnType<typeof selectPlayerCardEvent>, // null when idle
 * } | null}
 */
export function selectPlayerSummary(round, playerId, now = Date.now(), options = {}) {
  if (!round) return null;
  const player = round.players.find((p) => p.id === playerId);
  if (!player) return null;

  const manual = player.distance?.manual ?? null;
  const gps = selectPlayerGps(round, playerId, { runtimeMode: options.runtimeMode });
  const desc = describeManualReading(manual);
  const hasOwnGps = typeof gps?.valueM === "number";
  const lastShare = round.lastDistanceShare ?? null;
  // 거리 표시 정책 보완 §예외 4: a share only applies to the hole it was
  // made on. Once the hole advances (or in principle, if a share were
  // cancelled), both the corrected primary distance AND the secondary GPS
  // revert to a plain GPS-only display for EVERYONE, including the
  // measurer — their old "실측" reading is from a different hole/pin and
  // isn't relevant anymore. Selector-level guard only; no reducer change,
  // no change to the calculation formula itself.
  const shareAppliesToCurrentHole = !!lastShare && lastShare.holeNumber === round.currentHoleNumber;

  let distanceM = null;
  let distanceCategory = null;
  let distanceLine = null;
  let secondaryGpsM = null;
  let secondaryGpsLabel = null;

  if (desc && desc.category !== "shared_reference" && shareAppliesToCurrentHole) {
    // Priority 1 — always this player's own figure: either they measured
    // it themselves ("measured"), or a real pin-aware calculation was run
    // specifically for their position ("demo_estimate"/"coordinate_calc").
    // Never another player's number.
    distanceM = manual.valueM;
    distanceCategory = desc.category;
    const label = shortLabelForCategory(desc.category);
    const meta = formatDistanceMeta(manual, round.players);
    distanceLine = meta ? `${label} · ${meta}` : label;

    // §2 (measurer): secondary is their GPS *at share time* — the number
    // actually used in the delta calculation, not a live re-read — so it
    // stays consistent with whatever companions are seeing.
    if (desc.category === "measured" && typeof lastShare?.sharerGpsDistanceAtShareM === "number") {
      secondaryGpsM = lastShare.sharerGpsDistanceAtShareM;
      secondaryGpsLabel = `GPS ${secondaryGpsM}m`;
    }
  } else if (desc && desc.category === "shared_reference" && shareAppliesToCurrentHole) {
    // Pin location not known — apply the sharer's GPS-vs-measured delta
    // (frozen at share time) to THIS player's own *current* GPS, per the
    // corrected calculation rule (unchanged from the previous fix).
    const hasUsableSnapshot =
      typeof lastShare.sharerGpsDistanceAtShareM === "number" && typeof lastShare.referenceDistanceM === "number";

    if (hasUsableSnapshot && hasOwnGps) {
      const delta = lastShare.referenceDistanceM - lastShare.sharerGpsDistanceAtShareM;
      distanceM = clampDistanceM(Math.round(gps.valueM + delta));
      distanceCategory = "shared_adjusted_estimate";
      const sharerName = resolvePlayerName(round.players, manual.measuredBy);
      const time = formatRelativeTime(manual.updatedAt);
      const metaParts = [sharerName, time].filter(Boolean);
      distanceLine = metaParts.length ? `실측 보정 · ${metaParts.join(" · ")}` : "실측 보정";

      // §3 (동반자): secondary is their own *current/live* GPS — moving
      // updates both the primary corrected number AND this secondary
      // together (§예외 5), since both simply read gps.valueM fresh.
      secondaryGpsM = gps.valueM;
      secondaryGpsLabel = `GPS ${secondaryGpsM}m`;
    } else if (hasOwnGps) {
      // §예외 3: the sharer has no GPS-at-share snapshot to compute a
      // delta from — don't attempt a correction, just show this player's
      // own GPS like normal (no secondary — nothing to compare against).
      distanceM = gps.valueM;
      distanceCategory = "gps";
      distanceLine = "GPS"; // Information Diet: relative-time meta dropped -- repeated 4x per screen, low marginal value
    } else {
      // Never fabricate a number — this player has no GPS to correct.
      distanceCategory = "unavailable";
      distanceLine = "GPS 필요";
    }
  } else if (hasOwnGps) {
    // §예외 1/4: no share at all, or the existing share is for a different
    // hole — plain GPS-only display, no secondary (avoid duplicating the
    // same number twice on one row).
    distanceM = gps.valueM;
    distanceCategory = "gps";
    distanceLine = "GPS"; // Information Diet: relative-time meta dropped -- repeated 4x per screen, low marginal value
  } else {
    // Course Reference Prototype §9 — neither a manual reading nor any
    // GPS (real coordinate or mock) is available. Never fabricate a
    // number; the small text explicitly says so rather than staying
    // silently blank.
    distanceCategory = "unavailable";
    distanceLine = "위치 정보 없음";
  }

  return {
    id: player.id,
    name: player.name,
    color: player.color,
    isSpeaking: !!player.communication?.isSpeaking,
    distanceM,
    distanceCategory,
    distanceLine,
    secondaryGpsM,
    secondaryGpsLabel,
    cardEvent: selectPlayerCardEvent(round, playerId, now, { speakingOverride: options.speakingOverride }),
  };
}

/* ---------------------------------------------------------------------
 * A few small additional selectors — not in TASK-003's minimum list, but
 * useful glue for the existing UI (kept intentionally tiny/obvious rather
 * than expanding scope).
 * ------------------------------------------------------------------- */

export function selectOnlinePlayerCount(round) {
  if (!round) return 0;
  return round.players.filter((p) => p.connection === "online").length;
}

export function selectIsHoleComplete(round, holeNumber) {
  if (!round) return false;
  const hole = round.holes.find((h) => h.number === holeNumber);
  return hole ? hole.status === "completed" : false;
}

export function selectIsLastHole(round) {
  if (!round) return false;
  return round.currentHoleNumber >= round.course.totalHoles;
}
