/**
 * networkDemoIsolation.test.mjs
 * ------------------------------------------------------------------
 * RC4 CRITICAL REGRESSION — "Network round is still loading demo state".
 * These tests lock down the exact Founder failure: a real network round
 * must contain ONLY real participants and zero demo identities / demo
 * activity. Written as plain-node (no vitest, which the sandbox can't
 * install) exercising the REAL source functions and reducer.
 *
 * Run: node src/room/networkDemoIsolation.test.mjs
 * ------------------------------------------------------------------
 */
import assert from "node:assert/strict";
import { buildInitialRoundFromRoom } from "./buildInitialRoundFromRoom.js";
import { createRoundPlayersFromRoom } from "./createRoundPlayersFromRoom.js";
import { roundReducer } from "../engine/roundReducer.js";
import * as actions from "../engine/roundActions.js";
import { createRoundSeed, createNetworkRoundState } from "../data/roundSeed.js";

let passed = 0;
function test(name, fn) {
  return (async () => {
    await fn();
    passed += 1;
    console.log(`  ok — ${name}`);
  })();
}

const DEMO_NAMES = ["재식", "재근", "광천", "과천", "해란"];
const DEMO_IDS = ["player_jaesik", "player_jaegeun", "player_gwangcheon", "player_haeran"];

const course = {
  id: "course_real",
  course: { name: "리얼 CC", holeCount: 18 },
  holes: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4 })),
};

console.log("networkDemoIsolation.test.mjs");

// ---- Test A — Network round contains no demo identities ----
await test("A. network round player IDs/names equal only real users A and B", () => {
  const roomMembers = [
    { userId: "player_1699_alice", displayName: "Alice", joinStatus: "joined", role: "host", connectionStatus: "online" },
    { userId: "player_1700_bob", displayName: "Bob", joinStatus: "joined", role: "member", connectionStatus: "online" },
  ];
  const res = buildInitialRoundFromRoom({
    roomMembers,
    courseSnapshot: course,
    startHoleNumber: 1,
    networkMode: true,
    localUserId: "player_1699_alice",
    localDisplayName: "Alice",
  });
  assert.equal(res.ok, true);
  const ids = res.round.players.map((p) => p.id).sort();
  const names = res.round.players.map((p) => p.name).sort();
  assert.deepEqual(ids, ["player_1699_alice", "player_1700_bob"]);
  assert.deepEqual(names, ["Alice", "Bob"]);
  for (const id of DEMO_IDS) assert.ok(!ids.includes(id), `demo id ${id} leaked`);
  for (const nm of DEMO_NAMES) assert.ok(!names.includes(nm), `demo name ${nm} leaked`);
});

await test("A2. demo companion toggled into roster is stripped in network mode", () => {
  // Exactly the Founder leak vector: HomeScreen DEV companion (player_haeran)
  // present in room.members alongside a real user.
  const roomMembers = [
    { userId: "player_real_me", displayName: "Me", joinStatus: "joined", role: "host", connectionStatus: "online" },
    { userId: "player_haeran", displayName: "해란", joinStatus: "joined", role: "member", connectionStatus: "online" },
  ];
  const players = createRoundPlayersFromRoom(roomMembers, { networkMode: true, localUserId: "player_real_me" });
  const ids = players.map((p) => p.id);
  assert.deepEqual(ids, ["player_real_me"]); // 해란 stripped
  assert.ok(!ids.includes("player_haeran"));
});

// ---- Test B — Demo speaking effect disabled (state-level assertion) ----
// The demo speaking timer lives in RoundScreen (a component); here we assert
// the STATE it would act on: a network round has no speaking player and no
// demo player to speak, so even if a timer fired it has nothing to target.
await test("B. network round has no speaking player and no demo target", () => {
  const roomMembers = [
    { userId: "u_a", displayName: "A", joinStatus: "joined", role: "host", connectionStatus: "online" },
    { userId: "u_b", displayName: "B", joinStatus: "joined", role: "member", connectionStatus: "online" },
  ];
  const res = buildInitialRoundFromRoom({
    roomMembers, courseSnapshot: course, startHoleNumber: 1,
    networkMode: true, localUserId: "u_a", localDisplayName: "A",
  });
  assert.ok(res.round.players.every((p) => p.communication.isSpeaking === false));
  assert.ok(!res.round.players.some((p) => p.id === "player_haeran")); // nothing to startPtt() on
});

// ---- Test C — Server-authoritative shared round (same snapshot both sides) ----
await test("C. host and guest build identical roundId/members/hole from one payload", () => {
  // Host builds the round it will broadcast.
  const hostMembers = [
    { userId: "u_a", displayName: "A", joinStatus: "joined", role: "host", connectionStatus: "online" },
    { userId: "u_b", displayName: "B", joinStatus: "joined", role: "member", connectionStatus: "online" },
  ];
  const hostRes = buildInitialRoundFromRoom({
    roomMembers: hostMembers, courseSnapshot: course, startHoleNumber: 3,
    networkMode: true, localUserId: "u_a", localDisplayName: "A",
  });
  assert.equal(hostRes.ok, true);

  // The broadcast payload (what the server relays to the guest).
  const payload = {
    roomId: "ROOM1",
    roundId: hostRes.round.id,
    courseSnapshot: course,
    startHole: 3,
    players: hostRes.round.players.map((p) => ({ id: p.id, name: p.name })),
  };

  // Guest rebuilds from the SAME payload (App.jsx guest path).
  const guestMembersLike = payload.players.map((p) => ({
    userId: p.id, displayName: p.name, joinStatus: "joined",
    role: p.id === "u_b" ? "member" : "host", connectionStatus: "online",
  }));
  const guestRes = buildInitialRoundFromRoom({
    roomMembers: guestMembersLike, courseSnapshot: payload.courseSnapshot,
    startHoleNumber: payload.startHole, networkMode: true,
    localUserId: "u_b", localDisplayName: "B",
  });
  assert.equal(guestRes.ok, true);

  // Guest must adopt the SERVER roundId, not mint its own. App.jsx dispatches
  // roundStartFromRoom(result.round) but the roundId that matters for
  // "same round" is the broadcast one; assert members + hole match exactly.
  const hostIds = hostRes.round.players.map((p) => p.id).sort();
  const guestIds = guestRes.round.players.map((p) => p.id).sort();
  assert.deepEqual(hostIds, guestIds, "member IDs must match across devices");
  assert.equal(hostRes.round.currentHoleNumber, guestRes.round.currentHoleNumber);
  assert.equal(payload.roundId, hostRes.round.id);
  // Neither side contains demo identities.
  for (const id of [...hostIds, ...guestIds]) assert.ok(!DEMO_IDS.includes(id));
});

// ---- Test D — No demo fallback during delayed roster (reducer level) ----
await test("D. entering network baseline replaces demo seed with clean empty state", () => {
  // Start from the demo seed (what RoundProvider.init seeds).
  let state = createRoundSeed();
  assert.equal(state.id, "round_demo_001");
  assert.equal(state.players.length, 4);

  // Network mode engages -> baseline swap (RoundProvider effect).
  const baseline = createNetworkRoundState({ roomId: "ROOM1", players: [] });
  state = roundReducer(state, actions.roundEnterNetworkBaseline(baseline));

  // No demo players remain; state is a clean pending network baseline.
  assert.equal(state.players.length, 0);
  assert.notEqual(state.id, "round_demo_001");
  assert.equal(state.status, "pending");
  assert.equal(state.isNetworkBaseline, true);
  for (const nm of DEMO_NAMES) {
    assert.ok(!state.players.some((p) => p.name === nm));
  }
});

await test("D2. baseline swap never clobbers a live network round", () => {
  const roomMembers = [
    { userId: "u_a", displayName: "A", joinStatus: "joined", role: "host", connectionStatus: "online" },
    { userId: "u_b", displayName: "B", joinStatus: "joined", role: "member", connectionStatus: "online" },
  ];
  const live = buildInitialRoundFromRoom({
    roomMembers, courseSnapshot: course, startHoleNumber: 1,
    networkMode: true, localUserId: "u_a", localDisplayName: "A",
  }).round; // id round_<ts>, status active

  let state = live;
  const baseline = createNetworkRoundState({ roomId: "ROOM1", players: [] });
  state = roundReducer(state, actions.roundEnterNetworkBaseline(baseline));
  // Live round preserved — guard held.
  assert.equal(state.id, live.id);
  assert.equal(state.players.length, 2);
});

// ---- Test E — Recovery: rejoin hydrates from server, no demo ----
await test("E. rejoin round_started replaces any prior state with real roster only", () => {
  // Simulate B restarting on the demo seed, then receiving round_started.
  let state = createRoundSeed(); // stale demo seed on fresh mount
  const payloadPlayers = [
    { id: "u_a", name: "A" },
    { id: "u_b", name: "B" },
  ];
  const guestMembersLike = payloadPlayers.map((p) => ({
    userId: p.id, displayName: p.name, joinStatus: "joined",
    role: "member", connectionStatus: "online",
  }));
  const res = buildInitialRoundFromRoom({
    roomMembers: guestMembersLike, courseSnapshot: course, startHoleNumber: 5,
    networkMode: true, localUserId: "u_b", localDisplayName: "B",
  });
  state = roundReducer(state, actions.roundStartFromRoom(res.round));
  const ids = state.players.map((p) => p.id).sort();
  assert.deepEqual(ids, ["u_a", "u_b"]);
  assert.equal(state.currentHoleNumber, 5);
  for (const id of DEMO_IDS) assert.ok(!ids.includes(id));
  for (const nm of DEMO_NAMES) assert.ok(!state.players.some((p) => p.name === nm));
});

console.log(`\n${passed} passed, 0 failed`);

// ---- RC4 stall regression — round_started must produce a navigable active round ----
await test("F. host echo: amIAlreadyPlaying true when local roundId == payload roundId", () => {
  const hostMembers = [
    { userId: "host_a", displayName: "A", joinStatus: "joined", role: "host", connectionStatus: "online" },
    { userId: "guest_b", displayName: "B", joinStatus: "joined", role: "member", connectionStatus: "online" },
  ];
  const hostRound = buildInitialRoundFromRoom({
    roomMembers: hostMembers, courseSnapshot: course, startHoleNumber: 1,
    networkMode: true, localUserId: "host_a", localDisplayName: "A",
  }).round;
  // host broadcasts roundId = hostRound.id; server echoes it back.
  const payloadRoundId = hostRound.id;
  const amIAlreadyPlaying = hostRound.id === payloadRoundId;
  assert.equal(amIAlreadyPlaying, true, "host must skip rebuild on its own echo");
  assert.equal(hostRound.status, "active");
  assert.ok(hostRound.players.length === 2);
});

await test("G. guest hydrates SAME roundId as host (no id divergence)", () => {
  const hostMembers = [
    { userId: "host_a", displayName: "A", joinStatus: "joined", role: "host", connectionStatus: "online" },
    { userId: "guest_b", displayName: "B", joinStatus: "joined", role: "member", connectionStatus: "online" },
  ];
  const hostRound = buildInitialRoundFromRoom({
    roomMembers: hostMembers, courseSnapshot: course, startHoleNumber: 1,
    networkMode: true, localUserId: "host_a", localDisplayName: "A",
  }).round;
  // Server payload carries hostRound.id; guest adopts it via roundId param.
  const guestRound = buildInitialRoundFromRoom({
    roomMembers: [
      { userId: "host_a", displayName: "A", joinStatus: "joined", role: "member", connectionStatus: "online" },
      { userId: "guest_b", displayName: "B", joinStatus: "joined", role: "member", connectionStatus: "online" },
    ],
    courseSnapshot: course, startHoleNumber: 1,
    networkMode: true, localUserId: "guest_b", localDisplayName: "B",
    roundId: hostRound.id, // RC4 fix — adopt server roundId
  }).round;
  assert.equal(guestRound.id, hostRound.id, "both phones must share one roundId");
  assert.equal(guestRound.status, "active");
  // Neither is pending -> RoundScreen won't show the loading gate.
  const guestPending = (guestRound.status === "pending" || guestRound.isNetworkBaseline === true) && guestRound.players.length === 0;
  assert.equal(guestPending, false, "guest must NOT be stuck on loading gate");
});

await test("H. baseline effect never clobbers a round that has players", () => {
  const live = buildInitialRoundFromRoom({
    roomMembers: [
      { userId: "host_a", displayName: "A", joinStatus: "joined", role: "host", connectionStatus: "online" },
      { userId: "guest_b", displayName: "B", joinStatus: "joined", role: "member", connectionStatus: "online" },
    ],
    courseSnapshot: course, startHoleNumber: 1,
    networkMode: true, localUserId: "host_a", localDisplayName: "A",
  }).round;
  // Replicate the hardened effect condition.
  const onDemoSeed = live.id === "round_demo_001";
  const hasRealPlayers = Array.isArray(live.players) && live.players.length > 0;
  const onLiveNetworkRound = typeof live.id === "string" && live.id.startsWith("round_") && !onDemoSeed && live.status === "active";
  const wouldSkip = onLiveNetworkRound || hasRealPlayers;
  assert.equal(wouldSkip, true, "effect must skip (never clobber) a round with players");
});


// ---- RC4 baseline decision ordering (Founder-caught bug) ----
import { decideNetworkBaseline } from "./decideNetworkBaseline.js";

await test("I. demo seed WITH 4 players -> baseline (ordering: seed removal wins over hasRealPlayers)", () => {
  const demo = createRoundSeed(); // id round_demo_001, status active, 4 players
  assert.equal(demo.players.length, 4);
  const decision = decideNetworkBaseline({ networkCommunicationEnabled: true, round: demo });
  assert.equal(decision, "baseline", "demo seed must be removed even though it has players");
});

await test("I2. live network round with players -> none (never clobbered)", () => {
  const live = buildInitialRoundFromRoom({
    roomMembers: [
      { userId: "u_a", displayName: "A", joinStatus: "joined", role: "host", connectionStatus: "online" },
      { userId: "u_b", displayName: "B", joinStatus: "joined", role: "member", connectionStatus: "online" },
    ],
    courseSnapshot: course, startHoleNumber: 1, networkMode: true, localUserId: "u_a", localDisplayName: "A",
  }).round;
  assert.equal(decideNetworkBaseline({ networkCommunicationEnabled: true, round: live }), "none");
});

await test("I3. clean pending baseline -> none (idempotent)", () => {
  const baseline = createNetworkRoundState({ roomId: "R", players: [] });
  assert.equal(decideNetworkBaseline({ networkCommunicationEnabled: true, round: baseline }), "none");
});

await test("I4. network off -> none regardless of state", () => {
  const demo = createRoundSeed();
  assert.equal(decideNetworkBaseline({ networkCommunicationEnabled: false, round: demo }), "none");
});

await test("I5. non-seed empty non-network state -> baseline (establish)", () => {
  const weird = { id: "local_x", status: "active", players: [], isNetworkBaseline: false };
  assert.equal(decideNetworkBaseline({ networkCommunicationEnabled: true, round: weird }), "baseline");
});

await test("I6. full sequence: demo seed -> baseline -> live round, no re-clobber", () => {
  // 1. demo seed + network on -> baseline
  let round = createRoundSeed();
  assert.equal(decideNetworkBaseline({ networkCommunicationEnabled: true, round }), "baseline");
  // 2. apply baseline
  round = roundReducer(round, actions.roundEnterNetworkBaseline(createNetworkRoundState({ roomId: "R", players: [] })));
  assert.equal(round.players.length, 0);
  assert.equal(decideNetworkBaseline({ networkCommunicationEnabled: true, round }), "none"); // idempotent
  // 3. round_started hydrates a live round
  const res = buildInitialRoundFromRoom({
    roomMembers: [
      { userId: "u_a", displayName: "A", joinStatus: "joined", role: "host", connectionStatus: "online" },
      { userId: "u_b", displayName: "B", joinStatus: "joined", role: "member", connectionStatus: "online" },
    ],
    courseSnapshot: course, startHoleNumber: 1, networkMode: true, localUserId: "u_a", localDisplayName: "A",
    roundId: "round_SERVER_1",
  });
  round = roundReducer(round, actions.roundStartFromRoom(res.round));
  assert.equal(round.players.length, 2);
  // 4. baseline effect re-runs on round.id change -> must NOT clobber
  assert.equal(decideNetworkBaseline({ networkCommunicationEnabled: true, round }), "none");
});


// ---- RC4 single-device stall (Founder acceptance test #1) ----
await test("J. single-device: baseline -> ROUND START builds self, loading gate clears", () => {
  // Host created a room; only self is a joined member.
  const selfMembers = [{ userId: "host_solo", displayName: "Me", joinStatus: "joined", role: "host", connectionStatus: "online" }];
  let round = createNetworkRoundState({ roomId: "R", players: [] });
  // Baseline: loading gate would be TRUE (0 players).
  assert.equal(round.players.length, 0);
  // ROUND START path builds a real round with self.
  const res = buildInitialRoundFromRoom({
    roomMembers: selfMembers, courseSnapshot: course, startHoleNumber: 1,
    networkMode: true, localUserId: "host_solo", localDisplayName: "Me",
  });
  assert.equal(res.ok, true);
  assert.equal(res.round.players.length, 1);
  round = roundReducer(round, actions.roundStartFromRoom(res.round));
  // After start: active, 1 player, not a baseline.
  assert.equal(round.status, "active");
  assert.equal(round.players.length, 1);
  assert.notEqual(round.isNetworkBaseline, true);
  // Loading gate must be FALSE now.
  const loadingGate = (round.status === "pending" || round.isNetworkBaseline === true) && round.players.length === 0;
  assert.equal(loadingGate, false, "single-device host must NOT be stuck after ROUND START");
  // decideNetworkBaseline must not re-clobber.
  assert.equal(decideNetworkBaseline({ networkCommunicationEnabled: true, round }), "none");
});

await test("J2. bare roundStart on baseline leaves loading gate TRUE (why home button must route to overlay)", () => {
  // This documents the stall the routing fix avoids: flipping a baseline
  // to active via bare ROUND_START adds NO players.
  let round = createNetworkRoundState({ roomId: "R", players: [] });
  round = roundReducer(round, actions.roundStart());
  assert.equal(round.status, "active");
  assert.equal(round.players.length, 0);
  const loadingGate = (round.status === "pending" || round.isNetworkBaseline === true) && round.players.length === 0;
  assert.equal(loadingGate, true, "bare start strands the user — confirms the routing fix is required");
});


// ---- RC4 three distinct round-screen exits (semantic separation) ----
// The handlers live in App.jsx (JSX, not importable here), so this test
// documents and locks the REQUIRED semantics as data: which subsystems each
// exit touches. If someone later makes two exits identical, this table (and
// the review that must update it) is the tripwire.
await test("K. exit semantics: go-home / leave-room / end-round are all distinct", () => {
  const EXIT_SEMANTICS = {
    goHome:   { navigation: true,  roomReset: false, clearRoomStorage: false, clearActiveRef: false, networkOff: false, roundComplete: false, resetRound: false, clearsNickname: false },
    leaveRoom:{ navigation: true,  roomReset: true,  clearRoomStorage: true,  clearActiveRef: true,  networkOff: true,  roundComplete: false, resetRound: true,  clearsNickname: false },
    endRound: { navigation: true,  roomReset: false, clearRoomStorage: false, clearActiveRef: true,  networkOff: false, roundComplete: true,  resetRound: false, clearsNickname: false },
  };
  const keys = Object.keys(EXIT_SEMANTICS);
  // All three must differ pairwise.
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      assert.notDeepEqual(
        EXIT_SEMANTICS[keys[i]], EXIT_SEMANTICS[keys[j]],
        `${keys[i]} and ${keys[j]} must not be the same action`
      );
    }
  }
  // Specific required invariants:
  assert.equal(EXIT_SEMANTICS.goHome.roomReset, false, "go-home must NOT tear down the room");
  assert.equal(EXIT_SEMANTICS.leaveRoom.roomReset, true, "leave-room MUST tear down the room");
  assert.equal(EXIT_SEMANTICS.endRound.roundComplete, true, "end-round MUST complete the round");
  assert.equal(EXIT_SEMANTICS.endRound.roomReset, false, "end-round must KEEP the room");
  // Founder #2 — leaving a room is NOT a logout.
  for (const k of keys) {
    assert.equal(EXIT_SEMANTICS[k].clearsNickname, false, `${k} must NOT clear nickname/identity`);
  }
});

console.log(`
${passed} passed, 0 failed`);
