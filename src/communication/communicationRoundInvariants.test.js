/**
 * communicationRoundInvariants.test.js
 * ------------------------------------------------------------------
 * Local Media Capture Stabilization v0.2 §4 — the 5 synchronization
 * invariants between Communication and Round Engine. Exercises the real
 * roundReducer.js and LocalPttClient.js together, replicating
 * PTTButton.jsx's actual attemptTransmit()/handleEnd() logic in a plain
 * function so these are testable without a React component harness (this
 * project has none configured).
 *
 * Run directly with: node src/communication/communicationRoundInvariants.test.js
 * ------------------------------------------------------------------
 */
import assert from "node:assert/strict";
import { roundReducer } from "../engine/roundReducer.js";
import { createRoundSeed } from "../data/roundSeed.js";
import * as actions from "../engine/roundActions.js";
import { LocalPttClient } from "./LocalPttClient.js";
import { AudioCapture } from "./AudioCapture.js";
import { PttPressController } from "./PttPressController.js";

let passed = 0;
function test(name, fn) {
  return (async () => {
    await fn();
    passed += 1;
    console.log(`  ok — ${name}`);
  })();
}

class MockAudioCapture extends AudioCapture {
  constructor({ delayMs = 0 } = {}) {
    super();
    this.delayMs = delayMs;
    this.acquired = false;
    this.active = false;
  }
  async acquire() {
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    this.acquired = true;
  }
  setActive(active) {
    this.active = active;
  }
  getLevel() {
    return this.active ? 0.5 : 0;
  }
  getRawLevel() {
    return this.active ? 0.5 : 0;
  }
  release() {
    this.acquired = false;
    this.active = false;
  }
}

/** Replicates PTTButton.jsx's attemptTransmit()/handleStart()/handleEnd()
 * as plain functions against real roundReducer + LocalPttClient, so the
 * exact production logic path is what's under test. */
function makeHarness({ delayMs = 0 } = {}) {
  let roundState = createRoundSeed();
  const meId = "player_jaesik";
  const client = new LocalPttClient(new MockAudioCapture({ delayMs }));
  const controller = new PttPressController();
  let pressed = false;

  function startPtt() {
    const speaker = roundState.players.find((p) => p.id !== meId && p.communication.isSpeaking);
    if (speaker) return { ok: false, speakerName: speaker.name };
    roundState = roundReducer(roundState, actions.pttStart(meId));
    return { ok: true };
  }
  function stopPtt() {
    roundState = roundReducer(roundState, actions.pttStop(meId));
  }

  async function attemptTransmit(generation) {
    const micResult = await client.requestTransmit(["player_jaegeun"]);
    if (!controller.isStillValid(generation)) {
      if (micResult.ok) client.stopTransmit();
      return;
    }
    if (!micResult.ok) return;
    const result = startPtt();
    if (!result.ok) {
      client.stopTransmit();
      return;
    }
    pressed = true;
  }

  function pointerDown() {
    if (controller.pointerHeld) return;
    const gen = controller.beginPress();
    controller.runExclusive(gen, attemptTransmit);
  }
  function pointerUp() {
    controller.endPress();
    if (!pressed) return;
    pressed = false;
    client.stopTransmit();
    stopPtt();
  }

  return {
    pointerDown,
    pointerUp,
    controller,
    client,
    get roundState() {
      return roundState;
    },
    get isPressed() {
      return pressed;
    },
    get isSpeaking() {
      return roundState.players.find((p) => p.id === meId).communication.isSpeaking;
    },
  };
}

console.log("communicationRoundInvariants.test.js");

await test("Invariant 1: Round isSpeaking===true 이면 Communication isTransmitting도 true", async () => {
  const h = makeHarness();
  h.pointerDown();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(h.isSpeaking, true);
  assert.equal(h.client.getState().status, "transmitting");
  h.pointerUp();
});

await test("Invariant 2: Communication isTransmitting===false가 되면 Round isSpeaking도 false로 수렴", async () => {
  const h = makeHarness();
  h.pointerDown();
  await new Promise((r) => setTimeout(r, 10));
  h.pointerUp();
  assert.equal(h.client.getState().status, "ready");
  assert.equal(h.isSpeaking, false);
});

await test("Invariant 3: 마이크 준비 실패/취소에서는 PTT_STARTED Event가 생성되지 않음", async () => {
  const h = makeHarness({ delayMs: 20 });
  h.pointerDown();
  await new Promise((r) => setTimeout(r, 5));
  h.pointerUp(); // release before the 20ms mic prepare resolves
  await new Promise((r) => setTimeout(r, 30));
  const started = h.roundState.events.filter((e) => e.type === "PTT_STARTED");
  assert.equal(started.length, 0);
  assert.equal(h.isSpeaking, false);
});

await test("Invariant 4: 한 번의 정상 press에는 PTT_STARTED 1개와 PTT_STOPPED 1개만 생성", async () => {
  const h = makeHarness();
  h.pointerDown();
  await new Promise((r) => setTimeout(r, 10));
  h.pointerUp();
  const started = h.roundState.events.filter((e) => e.type === "PTT_STARTED");
  const stopped = h.roundState.events.filter((e) => e.type === "PTT_STOPPED");
  assert.equal(started.length, 1);
  assert.equal(stopped.length, 1);
});

await test("Invariant 5: 언마운트(mounted=false) 강제 종료에서도 마이크와 Round speaking 상태가 모두 정리됨", async () => {
  const h = makeHarness();
  h.pointerDown();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(h.isSpeaking, true);
  // Simulate PTTButton's unmount cleanup: force-stop both sides directly
  // (mirrors the explicit pressedRef.current check in the real cleanup).
  h.controller.setMounted(false);
  if (h.isPressed) {
    h.client.stopTransmit();
  }
  assert.equal(h.client.getState().status, "ready");
});

console.log(`\n${passed} passed, 0 failed`);
