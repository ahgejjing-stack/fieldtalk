import {
  ROUND_START,
  ROUND_RESET,
  ROUND_COMPLETE,
  HOLE_START,
  HOLE_SET_STATUS,
  HOLE_COMPLETE,
  NEXT_HOLE,
  PLAYER_SET_STATUS,
  PLAYER_SET_DISTANCE,
  PLAYER_SET_SCORE,
  PTT_START,
  PTT_STOP,
  SOUND_PLAYED,
  SHOT_CREATE,
  SHOT_START,
  SHOT_COMPLETE,
  SHOT_CANCEL,
  TEAM_DISTANCE_SHARE,
  HOLE_SET_GREEN_SELECTION,
  HOLE_SET_PIN_LOCATION_STATUS,
  PLAYER_SET_GPS_DISTANCE,
  PLAYER_SET_LOCATION,
  COURSE_SNAPSHOT_APPLIED,
  COURSE_SNAPSHOT_APPLIED_WITH_HOLES,
  ROUND_START_FROM_ROOM,
  ROUND_ENTER_NETWORK_BASELINE,
  ROUND_LEAVE_NETWORK,
} from "./roundActions.js";
import { calculateTeamDistances, canApplyPositionCorrection } from "./distanceCalculator.js";
import { selectPlayerGps } from "./roundSelectors.js";
import { createRoundSeed } from "../data/roundSeed.js";

const VALID_GREEN_SELECTIONS = ["single", "left", "right", "unknown"];
const VALID_PIN_LOCATION_STATUSES = ["unknown", "center_only", "coordinate_known", "bearing_known"];

const nowIso = () => new Date().toISOString();

let eventSeq = 0;
function makeEventId() {
  eventSeq += 1;
  return `evt_${Date.now()}_${eventSeq}`;
}

let shareSeq = 0;
function makeDistanceShareId() {
  shareSeq += 1;
  return `distance_share_${Date.now()}_${shareSeq}`;
}

function findShot(shots, shotId) {
  return shots.find((s) => s.id === shotId) || null;
}

function updateShot(shots, shotId, patch) {
  return shots.map((s) => (s.id === shotId ? { ...s, ...patch } : s));
}

function findHole(holes, holeNumber) {
  return holes.find((h) => h.number === holeNumber) || null;
}

function updateHole(holes, holeNumber, patch) {
  return holes.map((h) => (h.number === holeNumber ? { ...h, ...patch } : h));
}

function updatePlayer(players, playerId, patch) {
  return players.map((p) => (p.id === playerId ? { ...p, ...patch } : p));
}

function appendEvent(events, type, round, payload, actorPlayerId) {
  const evt = {
    id: makeEventId(),
    type,
    roundId: round.id,
    holeNumber: round.currentHoleNumber,
    actorPlayerId: actorPlayerId ?? null,
    createdAt: nowIso(),
    payload: payload ?? {},
  };
  return [...events, evt];
}

/** Clamp a distance reading to the allowed 1–1000m range (rule in TASK-003 §7). */
function clampDistance(valueM) {
  if (typeof valueM !== "number" || Number.isNaN(valueM)) return null;
  return Math.min(1000, Math.max(1, Math.round(valueM)));
}

export function roundReducer(state, action) {
  switch (action.type) {
    case ROUND_START: {
      if (state.status === "active") return state;
      return {
        ...state,
        status: "active",
        startedAt: state.startedAt ?? nowIso(),
        completedAt: null,
        events: appendEvent(state.events, "ROUND_STARTED", state, {}),
      };
    }

    case ROUND_RESET: {
      // TASK-010 Review §3: full replacement, not a patch — a finished
      // Room-based round (specific hole 18, specific players, specific
      // scores) must not leak into the next "라운드 시작". createRoundSeed()
      // is the same fallback RoundProvider.jsx already uses when no saved
      // round exists at all, so this produces exactly the same "fresh app"
      // state a first launch would.
      return createRoundSeed();
    }

    case ROUND_COMPLETE: {
      if (state.status === "completed") return state;
      return {
        ...state,
        status: "completed",
        completedAt: nowIso(),
        events: appendEvent(state.events, "ROUND_COMPLETED", state, {}),
      };
    }

    case HOLE_START: {
      const { holeNumber } = action.payload;
      const hole = findHole(state.holes, holeNumber);
      if (!hole) return state;
      return {
        ...state,
        holes: updateHole(state.holes, holeNumber, {
          status: "playing",
          startedAt: hole.startedAt ?? nowIso(),
        }),
      };
    }

    case HOLE_SET_STATUS: {
      const { holeNumber, status } = action.payload;
      const hole = findHole(state.holes, holeNumber);
      if (!hole) return state;
      const validStatuses = ["pending", "playing", "scoring", "completed"];
      if (!validStatuses.includes(status)) return state;
      return {
        ...state,
        holes: updateHole(state.holes, holeNumber, { status }),
      };
    }

    case HOLE_COMPLETE: {
      const { holeNumber } = action.payload;
      const hole = findHole(state.holes, holeNumber);
      if (!hole) return state;
      return {
        ...state,
        holes: updateHole(state.holes, holeNumber, {
          status: "completed",
          completedAt: nowIso(),
        }),
        events: appendEvent(state.events, "HOLE_COMPLETED", state, { holeNumber }),
      };
    }

    case NEXT_HOLE: {
      const current = findHole(state.holes, state.currentHoleNumber);
      // Rule: NEXT_HOLE only works once the current hole is completed.
      if (!current || current.status !== "completed") return state;

      const isLastHole = state.currentHoleNumber >= state.course.totalHoles;
      if (isLastHole) {
        if (state.status === "completed") return state;
        return {
          ...state,
          status: "completed",
          completedAt: nowIso(),
          events: appendEvent(state.events, "ROUND_COMPLETED", state, {}),
        };
      }

      const nextNumber = state.currentHoleNumber + 1;
      const nextHoleObj = findHole(state.holes, nextNumber);
      const holesWithNextStarted = nextHoleObj
        ? updateHole(state.holes, nextNumber, {
            status: "playing",
            startedAt: nextHoleObj.startedAt ?? nowIso(),
          })
        : state.holes;

      // P1-2 fix — a measured/shared distance is only meaningful for the
      // hole it was taken on; carrying it forward silently made a new
      // hole show the previous hole's number until someone measured
      // again. GPS baseline (distance.gps) is untouched — it's a
      // separate always-on field this Sprint doesn't change.
      const playersWithFreshDistance = state.players.map((p) => ({
        ...p,
        distance: { ...p.distance, manual: null },
      }));

      return {
        ...state,
        currentHoleNumber: nextNumber,
        holes: holesWithNextStarted,
        players: playersWithFreshDistance,
        lastDistanceShare: null,
        events: appendEvent(state.events, "HOLE_ADVANCED", state, {
          fromHole: state.currentHoleNumber,
          toHole: nextNumber,
        }),
      };
    }

    case PLAYER_SET_STATUS: {
      const { playerId, activity, activityLabel } = action.payload;
      const player = state.players.find((p) => p.id === playerId);
      if (!player) return state;
      return {
        ...state,
        players: updatePlayer(state.players, playerId, {
          activity: activity ?? player.activity,
          activityLabel: activityLabel ?? player.activityLabel,
          lastActivityAt: nowIso(),
        }),
      };
    }

    case PLAYER_SET_DISTANCE: {
      const { playerId, valueM, source, measuredBy } = action.payload;
      const player = state.players.find((p) => p.id === playerId);
      if (!player) return state;
      const clamped = clampDistance(valueM);
      if (clamped == null) return state;
      const updatedAt = nowIso();
      return {
        ...state,
        players: updatePlayer(state.players, playerId, {
          distance: {
            ...player.distance,
            manual: {
              valueM: clamped,
              source: source ?? "manual",
              updatedAt,
              measuredBy: measuredBy ?? playerId,
              referencePlayerId: null,
              calculationMode: "self_measured",
              isEstimated: false,
            },
          },
          lastActivityAt: updatedAt,
        }),
        events: appendEvent(
          state.events,
          "DISTANCE_SHARED",
          state,
          { referenceDistanceM: clamped, source: source ?? "manual" },
          playerId
        ),
      };
    }

    case PLAYER_SET_SCORE: {
      const { playerId, holeNumber, strokes } = action.payload;
      const player = state.players.find((p) => p.id === playerId);
      const hole = findHole(state.holes, holeNumber);
      if (!player || !hole) return state;
      // Rule: scores are only editable before the hole is marked completed.
      if (hole.status === "completed") return state;
      const clampedStrokes = Math.max(0, Math.min(15, Math.round(strokes)));
      return {
        ...state,
        players: updatePlayer(state.players, playerId, {
          scoreByHole: { ...player.scoreByHole, [holeNumber]: clampedStrokes },
          lastActivityAt: nowIso(),
        }),
      };
    }

    case PTT_START: {
      const { playerId } = action.payload;
      const player = state.players.find((p) => p.id === playerId);
      if (!player) return state;
      // Rule: only one speaker at a time. Reject (no-op) if someone else is
      // already speaking — callers should check selectSpeakingPlayer() first
      // via the useRound() guarded helper to surface a toast; this check is
      // a defense-in-depth backstop so the reducer stays correct even if a
      // caller dispatches PTT_START directly.
      const someoneElseSpeaking = state.players.some(
        (p) => p.id !== playerId && p.communication.isSpeaking
      );
      if (someoneElseSpeaking) return state;
      if (player.communication.isSpeaking) return state;

      return {
        ...state,
        players: updatePlayer(state.players, playerId, {
          communication: {
            ...player.communication,
            isSpeaking: true,
            speakingSince: nowIso(),
          },
        }),
        events: appendEvent(state.events, "PTT_STARTED", state, {}, playerId),
      };
    }

    case PTT_STOP: {
      const { playerId } = action.payload;
      const player = state.players.find((p) => p.id === playerId);
      if (!player) return state;
      if (!player.communication.isSpeaking) return state;

      return {
        ...state,
        players: updatePlayer(state.players, playerId, {
          communication: {
            isSpeaking: false,
            speakingSince: null,
            lastSpokeAt: nowIso(),
          },
        }),
        events: appendEvent(state.events, "PTT_STOPPED", state, {}, playerId),
      };
    }

    case SOUND_PLAYED: {
      const payload = action.payload || {};
      return {
        ...state,
        events: appendEvent(
          state.events,
          "SOUND_PLAYED",
          state,
          { soundId: payload.soundId, category: payload.category, label: payload.label },
          payload.actorPlayerId ?? null
        ),
      };
    }

    case SHOT_CREATE: {
      const { playerId, type, club, distanceToTargetM } = action.payload;
      const holeNumber = action.payload.holeNumber ?? state.currentHoleNumber;
      const player = state.players.find((p) => p.id === playerId);
      const hole = findHole(state.holes, holeNumber);
      if (!player || !hole) return state;

      const existingForPlayerHole = state.shots.filter(
        (s) => s.playerId === playerId && s.holeNumber === holeNumber
      );
      const sequence = existingForPlayerHole.length + 1;
      const shotId = `shot_${state.id}_h${holeNumber}_${playerId}_${String(sequence).padStart(3, "0")}`;

      const newShot = {
        id: shotId,
        roundId: state.id,
        holeNumber,
        playerId,
        sequence,
        type: type || "unknown",
        status: "planned",
        club: club ?? null,
        ballPosition: { latitude: null, longitude: null, source: "mock" },
        target: { type: "pin", latitude: null, longitude: null },
        distanceToTargetM: distanceToTargetM ?? null,
        createdAt: nowIso(),
        completedAt: null,
      };

      return {
        ...state,
        shots: [...state.shots, newShot],
        events: appendEvent(
          state.events,
          "SHOT_CREATED",
          state,
          { shotId, holeNumber, shotType: newShot.type },
          playerId
        ),
      };
    }

    case SHOT_START: {
      const { shotId } = action.payload;
      const shot = findShot(state.shots, shotId);
      if (!shot) return state;
      if (shot.status !== "planned") return state;

      const player = state.players.find((p) => p.id === shot.playerId);
      const players = player
        ? updatePlayer(state.players, shot.playerId, {
            // "shot_preparing" extends PLAYER_STATE_v0.1's activity enum for
            // TASK-004 — see docs/SHOT_DISTANCE_ENGINE_v0.1.md. Clearing the
            // custom activityLabel lets PlayerCard fall back to the default
            // label for the new activity instead of showing stale text.
            activity: "shot_preparing",
            activityLabel: null,
            lastActivityAt: nowIso(),
          })
        : state.players;

      return {
        ...state,
        players,
        shots: updateShot(state.shots, shotId, { status: "active" }),
        events: appendEvent(state.events, "SHOT_STARTED", state, { shotId }, shot.playerId),
      };
    }

    case SHOT_COMPLETE: {
      const { shotId } = action.payload;
      const shot = findShot(state.shots, shotId);
      if (!shot) return state;
      if (shot.status === "completed" || shot.status === "cancelled") return state;

      const player = state.players.find((p) => p.id === shot.playerId);
      const players = player
        ? updatePlayer(state.players, shot.playerId, {
            activity: "shot_complete",
            activityLabel: null,
            lastActivityAt: nowIso(),
          })
        : state.players;

      return {
        ...state,
        players,
        shots: updateShot(state.shots, shotId, { status: "completed", completedAt: nowIso() }),
        events: appendEvent(state.events, "SHOT_COMPLETED", state, { shotId }, shot.playerId),
      };
    }

    case SHOT_CANCEL: {
      const { shotId } = action.payload;
      const shot = findShot(state.shots, shotId);
      if (!shot) return state;
      if (shot.status === "completed" || shot.status === "cancelled") return state;

      return {
        ...state,
        shots: updateShot(state.shots, shotId, { status: "cancelled" }),
        events: appendEvent(state.events, "SHOT_CANCELLED", state, { shotId }, shot.playerId),
      };
    }

    case TEAM_DISTANCE_SHARE: {
      const { referencePlayerId, referenceDistanceM, source, runtimeMode } = action.payload;
      const currentHole = findHole(state.holes, state.currentHoleNumber);
      // IMPORTANT: correction eligibility depends only on whether we have a
      // real fix on the pin (pinLocationStatus), never on greenSelection —
      // knowing it's a "left green" tells us nothing about where the pin is.
      const pinLocationStatus = currentHole?.pin?.locationStatus ?? "unknown";
      const canCorrect = canApplyPositionCorrection(pinLocationStatus);

      const calc = calculateTeamDistances({
        players: state.players,
        referencePlayerId,
        referenceDistanceM,
        pinLocationStatus,
      });
      // Rule: calculation failure leaves state untouched.
      if (!calc.ok) return state;

      // 거리 공유 계산 규칙 정정: snapshot the sharer's GPS at THIS exact
      // moment. Companion distances (for the pinLocationStatus === "unknown"
      // case) are corrected live in selectPlayerSummary() using
      // `playerGps + (referenceDistanceM - sharerGpsDistanceAtShareM)` —
      // that delta must stay anchored to this share, never drift if the
      // sharer's GPS updates afterward. Purely additive: no existing field
      // changes meaning, no action payload shape changes.
      //
      // Course Reference Prototype §8: reads through selectPlayerGps() so
      // this snapshot uses real Green-Center-based coordinates when a
      // Level-2+ courseSnapshot + player.location are available, and the
      // pre-existing mock path otherwise — the delta formula above is
      // untouched either way.
      const sharerGps = selectPlayerGps(state, referencePlayerId, { runtimeMode });
      const sharerGpsDistanceAtShareM = typeof sharerGps?.valueM === "number" ? sharerGps.valueM : null;

      const sharedAt = nowIso();
      let players = state.players;
      for (const r of calc.results) {
        const target = players.find((p) => p.id === r.playerId);
        players = updatePlayer(players, r.playerId, {
          distance: {
            ...target.distance,
            manual: {
              valueM: r.distanceM,
              source: source ?? "manual",
              updatedAt: sharedAt,
              measuredBy: referencePlayerId,
              referencePlayerId,
              calculationMode: r.calculationMode,
              isEstimated: r.isEstimated,
            },
          },
          lastActivityAt: sharedAt,
        });
      }

      const lastDistanceShare = {
        id: makeDistanceShareId(),
        roundId: state.id,
        holeNumber: state.currentHoleNumber,
        referencePlayerId,
        referenceDistanceM: calc.referenceDistanceM,
        source: source ?? "manual",
        pinLocationStatus,
        correctionApplied: canCorrect,
        sharerGpsDistanceAtShareM,
        sharedAt,
        results: calc.results,
      };

      let events = appendEvent(
        state.events,
        "DISTANCE_SHARE_CREATED",
        state,
        {
          referencePlayerId,
          referenceDistanceM: calc.referenceDistanceM,
          source: source ?? "manual",
          pinLocationStatus,
          correctionApplied: canCorrect,
        },
        referencePlayerId
      );
      events = appendEvent(
        events,
        "TEAM_DISTANCES_UPDATED",
        state,
        { results: calc.results },
        referencePlayerId
      );

      return {
        ...state,
        players,
        lastDistanceShare,
        events,
      };
    }

    case HOLE_SET_GREEN_SELECTION: {
      const { holeNumber, greenSelection } = action.payload;
      const hole = findHole(state.holes, holeNumber);
      if (!hole) return state;
      if (!VALID_GREEN_SELECTIONS.includes(greenSelection)) return state;
      return {
        ...state,
        holes: updateHole(state.holes, holeNumber, {
          pin: { ...hole.pin, greenSelection },
        }),
        events: appendEvent(state.events, "GREEN_SELECTION_SET", state, { holeNumber, greenSelection }),
      };
    }

    case HOLE_SET_PIN_LOCATION_STATUS: {
      const { holeNumber, locationStatus } = action.payload;
      const hole = findHole(state.holes, holeNumber);
      if (!hole) return state;
      if (!VALID_PIN_LOCATION_STATUSES.includes(locationStatus)) return state;
      return {
        ...state,
        holes: updateHole(state.holes, holeNumber, {
          pin: { ...hole.pin, locationStatus },
        }),
        events: appendEvent(state.events, "PIN_LOCATION_STATUS_SET", state, { holeNumber, locationStatus }),
      };
    }

    case PLAYER_SET_GPS_DISTANCE: {
      const { playerId, valueM } = action.payload;
      const player = state.players.find((p) => p.id === playerId);
      if (!player) return state;
      const clamped = clampDistance(valueM);
      if (clamped == null) return state;
      return {
        ...state,
        players: updatePlayer(state.players, playerId, {
          distance: {
            ...player.distance,
            gps: {
              valueM: clamped,
              source: "gps",
              updatedAt: nowIso(),
              measuredBy: null,
            },
          },
        }),
      };
    }

    case PLAYER_SET_LOCATION: {
      // Course Reference Prototype §5/§7 — records a live coordinate,
      // completely separate from the mock GPS_BASE_M path above. Nothing
      // here touches player.distance.gps at all; selectPlayerGps() in
      // roundSelectors.js is what decides which of the two to surface.
      const { playerId, latitude, longitude } = action.payload;
      const player = state.players.find((p) => p.id === playerId);
      if (!player) return state;
      if (typeof latitude !== "number" || typeof longitude !== "number") return state;
      return {
        ...state,
        players: updatePlayer(state.players, playerId, {
          location: { latitude, longitude, updatedAt: nowIso() },
        }),
      };
    }

    case COURSE_SNAPSHOT_APPLIED: {
      // Course Reference Prototype §7 — Scenario E requires that once
      // applied, a Round's snapshot never changes even if the Provider's
      // underlying source data is edited afterward. A deep copy via
      // JSON round-trip guarantees no shared references leak through.
      const { courseSnapshot } = action.payload;
      return {
        ...state,
        courseSnapshot: courseSnapshot ? JSON.parse(JSON.stringify(courseSnapshot)) : null,
      };
    }

    case COURSE_SNAPSHOT_APPLIED_WITH_HOLES: {
      // Integration Hardening v0.2 §5 — Pre-Round "START": apply the
      // snapshot (same deep-copy guarantee as above) AND merge its
      // par/greenCenter into round.holes, matched by hole number. Course
      // Reference is static reference data; Round Hole is play-state data
      // — this merges only the specific fields §5 asks for and leaves
      // status/startedAt/completedAt/pin/wind exactly as they already are
      // on each existing hole object (never overwritten wholesale).
      const { courseSnapshot, startHoleNumber } = action.payload;
      const snapshot = courseSnapshot ? JSON.parse(JSON.stringify(courseSnapshot)) : null;

      const holes = snapshot
        ? state.holes.map((hole) => {
            const referenceHole = snapshot.holes?.find((h) => h.number === hole.number);
            if (!referenceHole) return hole;
            return {
              ...hole,
              par: typeof referenceHole.par === "number" ? referenceHole.par : hole.par,
              greenCenterReference: referenceHole.greenCenter ?? null,
            };
          })
        : state.holes;

      return {
        ...state,
        // Closure v0.1 §A-1: round.course is a fast-access summary of the
        // SAME snapshot just applied — never a different course than
        // courseSnapshot describes. Only the four summary fields, never
        // Provider raw fields. NEXT_HOLE keeps working unchanged since it
        // only ever reads round.course.totalHoles, which is still here.
        course: snapshot
          ? {
              id: snapshot.id,
              name: snapshot.course?.name,
              golfClubName: snapshot.golfClub?.name,
              totalHoles: snapshot.course?.holeCount,
            }
          : state.course,
        courseSnapshot: snapshot,
        holes,
        currentHoleNumber:
          typeof startHoleNumber === "number" && holes.some((h) => h.number === startHoleNumber)
            ? startHoleNumber
            : state.currentHoleNumber,
      };
    }

    case ROUND_START_FROM_ROOM: {
      // Round Room Foundation v0.1 §6 — wholesale replace, nothing partial.
      // buildInitialRoundFromRoom.js already validated joined members,
      // course selection, and start hole before this was ever dispatched,
      // so there's no "what if this fails halfway" case to guard against
      // here — either the whole new Round lands, or (defensively) nothing
      // changes if payload is somehow missing.
      const { preBuiltRound } = action.payload;
      if (!preBuiltRound) return state;
      return preBuiltRound;
    }

    case ROUND_LEAVE_NETWORK: {
      // RC4 — 명시적 방 나가기. ROUND_ENTER_NETWORK_BASELINE의 "라이브
      // 라운드는 덮어쓰지 않는다" 가드를 의도적으로 적용하지 않는다:
      // 사용자가 방을 나간 이상 그 네트워크 라운드는 반드시 사라져야 한다.
      // 데모 시드는 만들지 않는다(플레이어 0명).
      const { baseline } = action.payload;
      if (!baseline) return state;
      return baseline;
    }

    case ROUND_ENTER_NETWORK_BASELINE: {
      // RC4 CRITICAL REGRESSION FIX — replace whatever is loaded (the demo
      // seed on first launch, or a stale prior baseline) with a clean,
      // demo-free network baseline, so a network session NEVER renders
      // round_demo_001's players. Wholesale replace, same as
      // ROUND_START_FROM_ROOM.
      //
      // Guard: if a REAL network round is already active (a `round_<ts>`
      // id, produced only by buildInitialRoundFromRoom), do NOT clobber it
      // — that would wipe live players/scores. We only overwrite the demo
      // seed or an earlier pending baseline.
      const { baseline } = action.payload;
      if (!baseline) return state;
      // A live network round has a `round_<ts>` id AND is active — but the
      // DEMO SEED also literally starts with "round_" (round_demo_001) and
      // is active, so it must be excluded explicitly, otherwise the guard
      // would refuse to clear the very demo state this action exists to
      // remove (the RC4 regression).
      const isDemoSeed = state.id === "round_demo_001";
      const isLiveNetworkRound =
        !isDemoSeed &&
        typeof state.id === "string" &&
        state.id.startsWith("round_") &&
        state.status === "active";
      if (isLiveNetworkRound) return state;
      return baseline;
    }

    default:
      return state;
  }
}
