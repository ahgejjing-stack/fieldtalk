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

const NOW_ISO = () => new Date().toISOString();

// Same visual palette roundSeed.js already uses, so a Room-started round
// looks consistent with the demo — host always gets the same green the
// demo's host (재식) has always had.
const COLOR_PALETTE = ["#2FBE7F", "#4FA8FF", "#C9A24B", "#E37FBD"];

function mapConnectionStatus(roomConnectionStatus) {
  // Room's 4-state connection model collapses onto Player.connection's
  // simpler online/offline for now — reconnect nuance is explicitly out of
  // scope this Sprint (§ 구현하지 않음: Room 재연결).
  return roomConnectionStatus === "online" ? "online" : "offline";
}

/**
 * @param {Array} roomMembers - Room.members (any joinStatus)
 * @returns {Array} Player[] — only `joined` members, in their existing order
 */
export function createRoundPlayersFromRoom(roomMembers) {
  const joined = roomMembers.filter((m) => m.joinStatus === "joined");

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
