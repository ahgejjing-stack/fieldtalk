/**
 * createRoundPlayersFromRoom.js
 * ------------------------------------------------------------------
 * Round Room Foundation v0.1 §3 — the Adapter between Room and Round.
 * "RoomMember 객체를 Round Player로 그대로 사용하지 않는다" — every field
 * here is freshly constructed, matching roundSeed.js's makePlayer() shape
 * exactly, so selectPlayerSummary()/PlayerCard.jsx/ScoreCard.jsx etc. work
 * identically whether a Player came from the demo seed or a real Room.
 * ------------------------------------------------------------------
 */

import { DEMO_IDENTITIES } from "../identity/runtimeIdentity.js";

const NOW_ISO = () => new Date().toISOString();

// Same visual palette roundSeed.js already uses, so a Room-started round
// looks consistent with the demo — host always gets the same green the
// demo's host (재식) has always had.
const COLOR_PALETTE = ["#2FBE7F", "#4FA8FF", "#C9A24B", "#E37FBD"];

// RC4 P0-1 — the exact set of hardcoded demo/prototype user ids
// (player_jaesik/jaegeun/gwangcheon/haeran). HomeScreen.jsx's companion
// list uses these same ids for its DEV \"초대→참여 시뮬레이션\", which is
// how they can leak into a REAL network room's member list. Sourced from
// the one existing definition (DEMO_IDENTITIES) instead of a second
// hardcoded copy, so the two can never drift apart.
const DEMO_USER_IDS = new Set(DEMO_IDENTITIES.map((d) => d.userId));

function mapConnectionStatus(roomConnectionStatus) {
  // Room's 4-state connection model collapses onto Player.connection's
  // simpler online/offline for now — reconnect nuance is explicitly out of
  // scope this Sprint (§ 구현하지 않음: Room 재연결).
  return roomConnectionStatus === "online" ? "online" : "offline";
}

/**
 * @param {Array} roomMembers - Room.members (any joinStatus)
 * @param {object} [options]
 * @param {boolean} [options.networkMode=false] - true when building a REAL
 *   network round. In network mode, demo/prototype seed ids are stripped
 *   (RC4 P0-1: \"Network mode must never show demo players\"), EXCEPT the
 *   local user themselves (RC4 P0-2: actual local identity must always
 *   survive even if their id happens to collide with a demo id, e.g. a
 *   tester who joined as 재식/player_jaesik).
 * @param {string|null} [options.localUserId=null] - the current device's
 *   identity.userId, always preserved regardless of the demo filter.
 * @returns {Array} Player[] — only `joined` members, in their existing order
 */
export function createRoundPlayersFromRoom(roomMembers, options = {}) {
  const { networkMode = false, localUserId = null } = options;
  let joined = roomMembers.filter((m) => m.joinStatus === "joined");

  if (networkMode) {
    // RC4 P0-1/P0-2 — in a real network round, a member whose id is a
    // known demo/prototype id is a simulation artifact (HomeScreen's DEV
    // companion toggle), NOT a real participant, and must not appear.
    // The ONE exception is the local user themselves — never filter the
    // person actually holding the phone out of their own round.
    joined = joined.filter((m) => m.userId === localUserId || !DEMO_USER_IDS.has(m.userId));
  }

  return joined.map((member, index) => ({
    id: member.userId,
    name: member.displayName,
    displayName: member.displayName,
    pronunciation: member.displayName,
    role: member.role,
    connection: mapConnectionStatus(member.connectionStatus),
    activity: "ready",
    activityLabel: null,
    communication: {
      isSpeaking: false,
      speakingSince: null,
      lastSpokeAt: null,
    },
    distance: {
      // No mock GPS baseline for Room-started rounds — a real Room has no
      // business fabricating a GPS_BASE_M-style number for someone who
      // never provided a coordinate. Demo/Production GPS policy
      // (selectPlayerGps) already treats a missing gps field as "no GPS"
      // gracefully — nothing new needed here.
      gps: null,
      manual: {
        valueM: null,
        source: null,
        updatedAt: null,
        measuredBy: null,
        referencePlayerId: null,
        calculationMode: null,
        isEstimated: false,
      },
    },
    location: null,
    mockDistanceOffsetM: 0,
    scoreByHole: {},
    devices: {
      phoneConnected: true,
      headphonesConnected: false,
      watchConnected: false,
      watchType: null,
      batteryPercent: null,
    },
    color: COLOR_PALETTE[index % COLOR_PALETTE.length],
    lastActivityAt: NOW_ISO(),
  }));
}
