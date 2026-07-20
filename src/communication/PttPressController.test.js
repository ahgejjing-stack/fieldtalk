/**
 * PttPressController.test.js
 * ------------------------------------------------------------------
 * Local Media Capture Stabilization v0.2 §3/§8 — deterministic tests for
 * every quick-tap race scenario, using controlled-delay mock async
 * functions instead of a real browser (real-browser verification is
 * separate, via Chromium — see the Sprint 결과 보고).
 *
 * Run directly with: node src/communication/PttPressController.test.js
 * ------------------------------------------------------------------
 */
import assert from "node:assert/strict";
import { PttPressController } from "./PttPressController.js";

let passed = 0;
function test(name, fn) {
  return (async () => {
    await fn();
    passed += 1;
    console.log(`  ok — ${name}`);
  })();
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

console.log("PttPressController.test.js");

await test("§3-A 준비된 Warm 상태에서 짧게 탭 — 정상적으로 committed", async () => {
  const controller = new PttPressController();
  const gen = controller.beginPress();
  let committedCount = 0;
  await controller.runExclusive(gen, async (g) => {
    await delay(5); // warm: near-instant
    if (controller.isStillValid(g)) committedCount += 1;
  });
  assert.equal(committedCount, 1);
});

await test("§3-B 최초 권한 요청 전에 짧게 탭 — 손을 뗀 뒤 늦게 성공해도 committed 안 됨", async () => {
  const controller = new PttPressController();
  const gen = controller.beginPress();
  let committedCount = 0;
  const runPromise = controller.runExclusive(gen, async (g) => {
    await delay(30); // slow permission prompt
    if (controller.isStillValid(g)) committedCount += 1;
  });
  await delay(5);
  controller.endPress(); // released well before the 30ms resolves
  await runPromise;
  assert.equal(committedCount, 0);
});

await test("§3-C 권한 팝업이 열린 상태에서 pointercancel — 허용 후에도 송신 시작 안 됨", async () => {
  const controller = new PttPressController();
  const gen = controller.beginPress();
  let committedCount = 0;
  const runPromise = controller.runExclusive(gen, async (g) => {
    await delay(20);
    // simulates "permission granted" resolving successfully regardless
    if (controller.isStillValid(g)) committedCount += 1;
  });
  await delay(3);
  controller.endPress(); // pointercancel fires almost immediately
  await runPromise;
  assert.equal(committedCount, 0);
});

await test("§3-D Cold mode 준비 지연 중 손을 뗌 — 준비 완료 후 마이크가 켜지지 않음", async () => {
  const controller = new PttPressController();
  const gen = controller.beginPress();
  let micStartedButRolledBack = false;
  const runPromise = controller.runExclusive(gen, async (g) => {
    await delay(40); // cold mode: slow getUserMedia
    const micActivatedSuccessfully = true; // the mic call itself succeeded
    if (!controller.isStillValid(g)) {
      if (micActivatedSuccessfully) micStartedButRolledBack = true; // caller would call stopTransmit() here
      return;
    }
    throw new Error("should not reach commit branch");
  });
  await delay(5);
  controller.endPress();
  await runPromise;
  assert.equal(micStartedButRolledBack, true); // proves the rollback branch, not the commit branch, ran
});

await test("§3-E 연속 빠른 두 번 누름 — 첫 요청 결과가 두 번째 요청 상태를 덮어쓰지 않음, 정확히 1회만 committed", async () => {
  const controller = new PttPressController();
  const commits = [];

  const gen1 = controller.beginPress();
  const run1 = controller.runExclusive(gen1, async (g) => {
    await delay(15); // first press resolves slowly
    if (controller.isStillValid(g)) commits.push(g);
    // else: caller would stopTransmit() the mic this attempt turned on
  });

  await delay(5); // release + re-press happen while press 1 is still pending
  controller.endPress();
  const gen2 = controller.beginPress();
  assert.equal(gen2, 2);
  // Note: no second runExclusive() call here — runExclusive's own
  // in-flight guard is what's supposed to pick up generation 2 once press
  // 1's attempt settles, exactly like PTTButton.jsx will do by calling
  // runExclusive again with the latest generation from handleStart. We
  // simulate that second call the same way the component would:
  const run2 = controller.runExclusive(gen2, async (g) => {
    await delay(5);
    if (controller.isStillValid(g)) commits.push(g);
  });

  await Promise.all([run1, run2]);
  assert.deepEqual(commits, [2]); // only generation 2 ever committed
});

await test("§3-F 컴포넌트 언마운트 중 준비 완료 — 상태 업데이트/커밋 없음", async () => {
  const controller = new PttPressController();
  const gen = controller.beginPress();
  let committed = false;
  let rolledBack = false;
  const runPromise = controller.runExclusive(gen, async (g) => {
    await delay(20);
    if (!controller.isStillValid(g)) {
      rolledBack = true;
      return;
    }
    committed = true;
  });
  await delay(5);
  controller.setMounted(false); // unmount
  await runPromise;
  assert.equal(committed, false);
  assert.equal(rolledBack, true);
});

await test("§8-1/§8-2 prepare pending 중 cancel — 늦게 resolve된 결과 무효화", async () => {
  const controller = new PttPressController();
  const gen = controller.beginPress();
  const outcomes = [];
  const runPromise = controller.runExclusive(gen, async (g) => {
    await delay(25);
    outcomes.push(controller.isStillValid(g) ? "valid" : "invalid");
  });
  controller.endPress(); // cancel almost immediately
  await runPromise;
  assert.deepEqual(outcomes, ["invalid"]);
});

await test("§8-3 requestId(generation) 불일치 결과 무효화", async () => {
  const controller = new PttPressController();
  const gen1 = controller.beginPress();
  assert.equal(controller.isStillValid(gen1), true);
  controller.beginPress(); // a second beginPress bumps generation without an endPress between
  assert.equal(controller.isStillValid(gen1), false); // stale generation, even though pointer never released
});

await test("§8-4 빠른 연속 press — runExclusive 직렬화, 동시에 2개 in-flight 없음", async () => {
  const controller = new PttPressController();
  let concurrentCount = 0;
  let maxConcurrent = 0;

  const gen1 = controller.beginPress();
  const run1 = controller.runExclusive(gen1, async () => {
    concurrentCount += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrentCount);
    await delay(15);
    concurrentCount -= 1;
  });
  await delay(2);
  controller.endPress();
  const gen2 = controller.beginPress();
  const run2 = controller.runExclusive(gen2, async () => {
    concurrentCount += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrentCount);
    await delay(5);
    concurrentCount -= 1;
  });

  await Promise.all([run1, run2]);
  assert.equal(maxConcurrent, 1); // never more than one attempt actually running its body concurrently
});

await test("§8-5 unmount/release 중 pending resolve — 무효화 확인", async () => {
  const controller = new PttPressController();
  const gen = controller.beginPress();
  let sawInvalid = false;
  const runPromise = controller.runExclusive(gen, async (g) => {
    await delay(10);
    if (!controller.isStillValid(g)) sawInvalid = true;
  });
  controller.setMounted(false);
  await runPromise;
  assert.equal(sawInvalid, true);
});

await test("Hotfix v0.2: external stop(예: 백그라운드 전환) 후 endPress() 호출 시 pointerHeld가 false로 정리됨", () => {
  const controller = new PttPressController();
  controller.beginPress();
  assert.equal(controller.pointerHeld, true);
  // Simulates PTTButton's external-stop-sync effect calling endPress()
  // directly (not via a real pointerup) when CommunicationProvider force-
  // stops the mic on visibilitychange without ever delivering pointercancel.
  controller.endPress();
  assert.equal(controller.pointerHeld, false);
});

await test("Hotfix v0.2: background stop 이후에도 다음 beginPress()가 정상적으로 새 세대를 시작함", () => {
  const controller = new PttPressController();
  const gen1 = controller.beginPress();
  controller.endPress(); // external stop, as PTTButton's effect now does
  assert.equal(controller.pointerHeld, false);
  const gen2 = controller.beginPress(); // user returns to the app and presses again
  assert.equal(controller.pointerHeld, true);
  assert.notEqual(gen2, gen1);
  assert.equal(controller.isStillValid(gen2), true);
});

await test("Hotfix v0.2: unmount(setMounted(false)) 후 pointerHeld도 함께 정리되어야 다음 마운트에서 stale held가 안 남음", () => {
  const controller = new PttPressController();
  controller.beginPress();
  assert.equal(controller.pointerHeld, true);
  // PTTButton's unmount cleanup now calls endPress() explicitly, in
  // addition to setMounted(false) — verifies that pattern directly.
  controller.setMounted(false);
  controller.endPress();
  assert.equal(controller.pointerHeld, false);
  assert.equal(controller.mounted, false);
});

console.log(`\n${passed} passed, 0 failed`);
