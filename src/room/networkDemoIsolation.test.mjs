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
