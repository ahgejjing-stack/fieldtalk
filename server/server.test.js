/**
 * server.test.js
 * ------------------------------------------------------------------
 * Two Device PTT Foundation v0.1 §12 — server unit tests 1-7. Tests
 * PttLockManager and RoomRegistry directly (pure logic), no actual
 * socket needed — the full signaling protocol over a real WebSocket is
 * separately verified via Chromium (see the Sprint 결과 보고).
 *
 * Run directly with: node server/server.test.js
 * ------------------------------------------------------------------
 */
import assert from "node:assert/strict";
import { PttLockManager } from "./pttLockManager.js";
import { RoomRegistry } from "./roomRegistry.js";

let passed = 0;
function test(name, fn) {
  return (async () => {
    await fn();
    passed += 1;
    console.log(`  ok — ${name}`);
  })();
}

console.log("server.test.js");

await test("1. 첫 요청 granted", () => {
  const mgr = new PttLockManager({ leaseDurationMs: 5000 });
  const result = mgr.requestLock("room1", "player_jaesik");
  assert.equal(result.granted, true);
  assert.equal(mgr.getCurrentSpeaker("room1"), "player_jaesik");
});

await test("2. 두 번째 사용자 동시 요청 denied", () => {
  const mgr = new PttLockManager({ leaseDurationMs: 5000 });
  mgr.requestLock("room1", "player_jaesik");
  const result2 = mgr.requestLock("room1", "player_jaegeun");
  assert.equal(result2.granted, false);
  assert.equal(result2.reason, "room_locked");
  assert.equal(mgr.getCurrentSpeaker("room1"), "player_jaesik"); // unchanged
});

await test("3. release 후 두 번째 요청 granted", () => {
  const mgr = new PttLockManager({ leaseDurationMs: 5000 });
  mgr.requestLock("room1", "player_jaesik");
  mgr.release("room1", "player_jaesik");
  const result = mgr.requestLock("room1", "player_jaegeun");
  assert.equal(result.granted, true);
  assert.equal(mgr.getCurrentSpeaker("room1"), "player_jaegeun");
});

await test("4. socket disconnect 시 lock 해제 (releaseIfHeldBy)", () => {
  const mgr = new PttLockManager({ leaseDurationMs: 5000 });
  mgr.requestLock("room1", "player_jaesik");
  const released = mgr.releaseIfHeldBy("room1", "player_jaesik");
  assert.equal(released, true);
  assert.equal(mgr.isLocked("room1"), false);

  // A disconnecting user who was NOT the speaker should not release
  // someone else's lock.
  mgr.requestLock("room1", "player_jaegeun");
  const releasedOther = mgr.releaseIfHeldBy("room1", "player_gwangcheon");
  assert.equal(releasedOther, false);
  assert.equal(mgr.getCurrentSpeaker("room1"), "player_jaegeun");
});

await test("5. lease timeout 시 lock 해제", async () => {
  const mgr = new PttLockManager({ leaseDurationMs: 30 });
  mgr.requestLock("room1", "player_jaesik");
  assert.equal(mgr.isLocked("room1"), true);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(mgr.isLocked("room1"), false);
  // And a new request can now succeed.
  const result = mgr.requestLock("room1", "player_jaegeun");
  assert.equal(result.granted, true);
});

await test("5b. onExpired callback이 만료된 roomId/userId와 함께 호출됨", async () => {
  const mgr = new PttLockManager({ leaseDurationMs: 20 });
  let expiredArgs = null;
  mgr.onExpired = (roomId, userId) => {
    expiredArgs = { roomId, userId };
  };
  mgr.requestLock("roomX", "player_haeran");
  await new Promise((r) => setTimeout(r, 45));
  assert.deepEqual(expiredArgs, { roomId: "roomX", userId: "player_haeran" });
});

await test("6. Room 비멤버 요청 거부 (RoomRegistry.isMember로 사전 검증)", () => {
  const registry = new RoomRegistry();
  const fakeWs = { send: () => {} };
  registry.addMember("room1", "player_jaesik", fakeWs, { displayName: "재식", deviceSessionId: "dev1" });

  assert.equal(registry.isMember("room1", "player_jaesik"), true);
  assert.equal(registry.isMember("room1", "player_unknown"), false);
  // signalingServer.js's ptt_request handler is expected to check this
  // BEFORE calling PttLockManager.requestLock() — a non-member's request
  // never reaches the lock manager at all.
});

await test("7. 대상 비멤버 제거/거부 (targetUserIds 필터링)", () => {
  const registry = new RoomRegistry();
  const fakeWs = { send: () => {} };
  registry.addMember("room1", "player_jaesik", fakeWs, { displayName: "재식", deviceSessionId: "dev1" });
  registry.addMember("room1", "player_jaegeun", fakeWs, { displayName: "재근", deviceSessionId: "dev2" });

  const requestedTargets = ["player_jaegeun", "player_unknown_intruder"];
  const validTargets = requestedTargets.filter((id) => registry.isMember("room1", id));
  assert.deepEqual(validTargets, ["player_jaegeun"]);
});

console.log(`\n${passed} passed, 0 failed`);
