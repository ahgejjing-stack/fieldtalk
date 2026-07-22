/**
 * buildInitialRoundFromRoom.js
 * ------------------------------------------------------------------
 * Round Room Foundation v0.1 §6 — "가능하면 하나의 명시적 START action 또는
 * initializer를 사용... 여러 dispatch를 UI에서 순서대로 호출하는 방식은
 * 피하세요."
 *
 * This is that initializer: a pure function that either returns a
 * complete, internally-consistent Round object ready to dispatch in ONE
 * action, or a structured failure reason — never a partially-built Round.
 * The caller (useStartRoundFromRoom.js) validates the result BEFORE
 * dispatching anything, so a failure here never leaves Room or Round in
 * an inconsistent state (nothing has been touched yet at that point).
 * ------------------------------------------------------------------
 */
import { buildPendingHole } from "../data/roundSeed.js";
import { createRoundPlayersFromRoom } from "./createRoundPlayersFromRoom.js";

const NOW_ISO = () => new Date().toISOString();
let eventSeq = 0;
function makeEventId() {
  eventSeq += 1;
  return `evt_room_${Date.now()}_${eventSeq}`;
}

/**
 * @param {object} params
 * @param {Array} params.roomMembers - Room.members (any joinStatus; this
 *   function filters to `joined` itself via createRoundPlayersFromRoom)
 * @param {object|null} params.courseSnapshot - normalized CourseReference
 *   (see src/course/normalizeCourse.js), already provider-agnostic
 * @param {number} params.startHoleNumber
 * @param {boolean} [params.networkMode=false] - RC4 P0-1: when true, demo
 *   seed ids are stripped from the resulting Round so a real network round
 *   can never contain prototype demo players.
 * @param {string|null} [params.localUserId=null] - RC4 P0-2: the current
 *   device's identity.userId, always preserved in players even under the
 *   demo filter.
 * @returns {{ ok: true, round: object } | { ok: false, reason: string }}
 */
export function buildInitialRoundFromRoom({
  roomMembers,
  courseSnapshot,
  startHoleNumber,
  networkMode = false,
  localUserId = null,
  localDisplayName = null,
}) {
  let players = createRoundPlayersFromRoom(roomMembers ?? [], { networkMode, localUserId });

  // RC4 P0-2 — in network mode the local user must ALWAYS be present in
  // their own round, even if a transient roster gap means their own
  // member entry hasn't been mirrored into room.members yet at this exact
  // moment. This never fabricates OTHER players (that would re-introduce a
  // demo-like fallback); it only guarantees self is never missing, which
  // is also what keeps "(나)" and self-referenced distance sharing working.
  if (networkMode && localUserId && !players.some((p) => p.id === localUserId)) {
    const selfMember = {
      userId: localUserId,
      displayName: localDisplayName ?? "나",
      role: "host",
      joinStatus: "joined",
      connectionStatus: "online",
    };
    const selfPlayer = createRoundPlayersFromRoom([selfMember], { networkMode, localUserId });
    players = [...selfPlayer, ...players];
  }

  if (players.length === 0) {
    return { ok: false, reason: "no_joined_members" };
  }
  if (!courseSnapshot) {
    return { ok: false, reason: "no_course_selected" };
  }
  const holeCount = courseSnapshot.course?.holeCount ?? 18;
  if (
    typeof startHoleNumber !== "number" ||
    startHoleNumber < 1 ||
    startHoleNumber > holeCount
  ) {
    return { ok: false, reason: "invalid_start_hole" };
  }

  // §6 steps 4-7: build every hole as a bare "pending" placeholder (no
  // demo hole-7 special-casing — that's the seed's own concern, not a real
  // Room-started round's), merge PAR/greenCenter from the CourseReference
  // by hole number, then mark exactly the chosen start hole "playing" —
  // step 7's "다른 홀의 잘못된 playing 상태 정리" is automatically satisfied
  // because every hole starts "pending" here; only the one we explicitly
  // flip below is ever "playing".
  const holes = [];
  for (let n = 1; n <= holeCount; n += 1) {
    const base = buildPendingHole(n);
    const referenceHole = courseSnapshot.holes?.find((h) => h.number === n);
    const withPar = referenceHole ? { ...base, par: referenceHole.par ?? base.par } : base;
    holes.push(
      n === startHoleNumber
        ? { ...withPar, status: "playing", startedAt: NOW_ISO() }
        : withPar
    );
  }

  const roundId = `round_${Date.now()}`;

  const round = {
    schemaVersion: 1,
    id: roundId,
    status: "active",
    course: {
      id: courseSnapshot.id,
      name: courseSnapshot.course?.name,
      golfClubName: courseSnapshot.golfClub?.name,
      totalHoles: holeCount,
    },
    courseSnapshot,
    currentHoleNumber: startHoleNumber,
    startedAt: NOW_ISO(),
    completedAt: null,
    settings: {
      unit: "meter",
      soundMode: "fun",
      outputTargets: ["phone", "headphones", "watch"],
    },
    holes,
    players,
    events: [
      {
        id: makeEventId(),
        type: "ROUND_STARTED",
        roundId,
        holeNumber: startHoleNumber,
        actorPlayerId: null,
        createdAt: NOW_ISO(),
        payload: { source: "room", playerCount: players.length },
      },
    ],
    shots: [],
    lastDistanceShare: null,
  };

  return { ok: true, round };
}
