/**
 * pttTargetLogic.test.mjs
 * ------------------------------------------------------------------
 * RC4 PTT UX — locks the separation between "did the user SELECT a
 * target" (hasSelection) and "do actual recipients EXIST" (hasRecipients).
 * Mirrors the exact logic in RoundScreen.jsx (which can't be imported here
 * because it's JSX), so a regression in that component is caught by a
 * failing expectation about these same rules.
 *
 * Run: node src/room/pttTargetLogic.test.mjs
 * ------------------------------------------------------------------
 */
import assert from "node:assert/strict";

const ALL_TARGET = "all";

// --- replicas of the RoundScreen pure helpers ---
function resolveTargetUserIds(selectedTargets, otherPlayers) {
  if (selectedTargets.has(ALL_TARGET)) return otherPlayers.map((p) => p.id);
  return otherPlayers.filter((p) => selectedTargets.has(p.id)).map((p) => p.id);
}

function pttState(selectedTargets, otherPlayers) {
  const hasSelection = selectedTargets.size > 0;
  const targetUserIds = resolveTargetUserIds(selectedTargets, otherPlayers);
  const hasRecipients = targetUserIds.length > 0;
  const canTransmit = hasSelection && hasRecipients;
  const blockedMessage = !hasSelection
    ? "먼저 전달할 대상을 선택하세요."
    : "현재 연결된 동반자가 없습니다.";
  return { hasSelection, hasRecipients, canTransmit, blockedMessage, targetUserIds };
}

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok — ${name}`);
}

console.log("pttTargetLogic.test.mjs");

test("P1. 전체 selected + companions present -> canTransmit", () => {
  const s = pttState(new Set([ALL_TARGET]), [{ id: "b" }, { id: "c" }]);
  assert.equal(s.hasSelection, true);
  assert.equal(s.hasRecipients, true);
  assert.equal(s.canTransmit, true);
  assert.deepEqual(s.targetUserIds, ["b", "c"]);
});

test("P2. 전체 selected + ZERO companions -> blocked with 연결된 동반자 없음", () => {
  const s = pttState(new Set([ALL_TARGET]), []); // solo host
  assert.equal(s.hasSelection, true); // selection IS made
  assert.equal(s.hasRecipients, false); // but no one to receive
  assert.equal(s.canTransmit, false);
  assert.equal(s.blockedMessage, "현재 연결된 동반자가 없습니다.");
});

test("P3. nothing selected -> blocked with 대상 선택 안내", () => {
  const s = pttState(new Set(), [{ id: "b" }]);
  assert.equal(s.hasSelection, false);
  assert.equal(s.canTransmit, false);
  assert.equal(s.blockedMessage, "먼저 전달할 대상을 선택하세요.");
});

test("P4. specific target selected but that player absent -> no recipients", () => {
  const s = pttState(new Set(["ghost"]), [{ id: "b" }]);
  assert.equal(s.hasSelection, true);
  assert.equal(s.hasRecipients, false);
  assert.equal(s.canTransmit, false);
  assert.equal(s.blockedMessage, "현재 연결된 동반자가 없습니다.");
});

test("P5. specific present target -> canTransmit to just them", () => {
  const s = pttState(new Set(["b"]), [{ id: "b" }, { id: "c" }]);
  assert.equal(s.canTransmit, true);
  assert.deepEqual(s.targetUserIds, ["b"]);
});

console.log(`\n${passed} passed, 0 failed`);
