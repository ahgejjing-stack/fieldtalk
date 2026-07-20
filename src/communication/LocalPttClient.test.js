/**
 * LocalPttClient.test.js
 * ------------------------------------------------------------------
 * Local Media Capture Prototype v0.1 §12 — tests 1-6. Uses a mock
 * AudioCapture (no real browser needed) so these run in plain Node.
 * Real-browser verification (permission dialogs, actual mic reactivity,
 * background-tab teardown) is done separately via Chromium with
 * --use-fake-device-for-media-stream — see the Sprint's 결과 보고.
 *
 * Run directly with: node src/communication/LocalPttClient.test.js
 * ------------------------------------------------------------------
 */
import assert from "node:assert/strict";
import { LocalPttClient } from "./LocalPttClient.js";
import { AudioCapture } from "./AudioCapture.js";
import { COMMUNICATION_STATES } from "./communicationState.js";

let passed = 0;
function test(name, fn) {
  return (async () => {
    await fn();
    passed += 1;
    console.log(`  ok — ${name}`);
  })();
}

console.log("LocalPttClient.test.js");

/** Mock AudioCapture — tracks call counts instead of touching any real
 * browser API, and can be configured to fail acquire() on demand. */
class MockAudioCapture extends AudioCapture {
  constructor({ failAcquire = false, denied = false } = {}) {
    super();
    this.failAcquire = failAcquire;
    this.denied = denied;
    this.acquireCalls = 0;
    this.releaseCalls = 0;
    this.setActiveCalls = [];
    this.acquired = false;
    this.active = false;
    this.level = 0.42;
  }
  async acquire() {
    this.acquireCalls += 1;
    if (this.acquired) return;
    if (this.failAcquire) {
      const err = new Error("mock_failure");
      if (this.denied) err.name = "NotAllowedError";
      throw err;
    }
    this.acquired = true;
  }
  setActive(active) {
    this.setActiveCalls.push(active);
    this.active = active;
  }
  getLevel() {
    return this.active ? this.level : 0;
  }
  release() {
    this.releaseCalls += 1;
    this.acquired = false;
    this.active = false;
  }
}

await test("§12-1 상태 전이: idle → preparing(경유) → ready", async () => {
  const capture = new MockAudioCapture();
  const client = new LocalPttClient(capture);
  assert.equal(client.getState().status, COMMUNICATION_STATES.IDLE);
  const statuses = [];
  client.subscribe((s) => statuses.push(s.status));
  const result = await client.prepare();
  assert.equal(result.ok, true);
  assert.equal(client.getState().status, COMMUNICATION_STATES.READY);
  assert.ok(statuses.includes(COMMUNICATION_STATES.PREPARING));
});

await test("§12-1 ready → transmitting → ready (warm)", async () => {
  const capture = new MockAudioCapture();
  const client = new LocalPttClient(capture, { streamLifecycle: "warm" });
  await client.prepare();
  const start = await client.requestTransmit(["p2"]);
  assert.equal(start.ok, true);
  assert.equal(client.getState().status, COMMUNICATION_STATES.TRANSMITTING);
  client.stopTransmit();
  assert.equal(client.getState().status, COMMUNICATION_STATES.READY);
  assert.equal(capture.releaseCalls, 0); // warm mode never releases on stop
});

await test("§12-1 권한 거부 → permission_denied", async () => {
  const capture = new MockAudioCapture({ failAcquire: true, denied: true });
  const client = new LocalPttClient(capture);
  const result = await client.prepare();
  assert.equal(result.ok, false);
  assert.equal(result.reason, "permission_denied");
  assert.equal(client.getState().status, COMMUNICATION_STATES.PERMISSION_DENIED);
  assert.equal(client.getState().permissionStatus, "denied");
});

await test("§12-1 release → idle", async () => {
  const capture = new MockAudioCapture();
  const client = new LocalPttClient(capture);
  await client.prepare();
  client.release();
  assert.equal(client.getState().status, COMMUNICATION_STATES.IDLE);
  assert.equal(capture.releaseCalls, 1);
});

await test("§12-2 대상 없음 — requestTransmit([]) 실패, 마이크 활성 안 됨", async () => {
  const capture = new MockAudioCapture();
  const client = new LocalPttClient(capture);
  const result = await client.requestTransmit([]);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "no_target");
  assert.equal(capture.acquireCalls, 0);
  assert.equal(capture.setActiveCalls.length, 0);
  assert.equal(client.getState().status, COMMUNICATION_STATES.IDLE);
});

await test("§12-3 마이크 준비 실패 — transmitting 진입 안 함", async () => {
  const capture = new MockAudioCapture({ failAcquire: true, denied: false });
  const client = new LocalPttClient(capture);
  const result = await client.requestTransmit(["p2"]);
  assert.equal(result.ok, false);
  assert.equal(client.getState().status, COMMUNICATION_STATES.UNAVAILABLE);
  assert.notEqual(client.getState().status, COMMUNICATION_STATES.TRANSMITTING);
});

await test("§12-4 stop — track 비활성, inputLevel 0, isTransmitting false", async () => {
  const capture = new MockAudioCapture();
  const client = new LocalPttClient(capture);
  await client.requestTransmit(["p2"]);
  assert.equal(capture.active, true);
  client.stopTransmit();
  assert.equal(capture.active, false);
  assert.equal(client.getState().inputLevel, 0);
  assert.notEqual(client.getState().status, COMMUNICATION_STATES.TRANSMITTING);
});

await test("§12-5 release — 모든 track stop, 리소스 정리", async () => {
  const capture = new MockAudioCapture();
  const client = new LocalPttClient(capture);
  await client.requestTransmit(["p2"]);
  client.release();
  assert.equal(capture.releaseCalls, 1);
  assert.equal(capture.acquired, false);
  assert.equal(client.getState().status, COMMUNICATION_STATES.IDLE);
});

await test("§12-6 중복 start/stop 호출해도 안전", async () => {
  const capture = new MockAudioCapture();
  const client = new LocalPttClient(capture);
  const r1 = await client.requestTransmit(["p2"]);
  const r2 = await client.requestTransmit(["p2"]); // already transmitting
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  assert.equal(capture.acquireCalls, 1); // didn't re-acquire
  client.stopTransmit();
  client.stopTransmit(); // second call is a no-op, doesn't throw
  assert.equal(client.getState().status, COMMUNICATION_STATES.READY);
});

console.log("\n§7 Warm vs Cold — acquire() call count comparison:");
{
  const warmCapture = new MockAudioCapture();
  const warmClient = new LocalPttClient(warmCapture, { streamLifecycle: "warm" });
  await warmClient.prepare();
  await warmClient.requestTransmit(["p2"]);
  warmClient.stopTransmit();
  await warmClient.requestTransmit(["p2"]);
  warmClient.stopTransmit();
  console.log(`  warm: acquireCalls=${warmCapture.acquireCalls} releaseCalls=${warmCapture.releaseCalls} (재획득 없음, 두 번째 송신 즉시 시작)`);
  assert.equal(warmCapture.acquireCalls, 1);
  assert.equal(warmCapture.releaseCalls, 0);

  const coldCapture = new MockAudioCapture();
  const coldClient = new LocalPttClient(coldCapture, { streamLifecycle: "cold" });
  await coldClient.requestTransmit(["p2"]);
  coldClient.stopTransmit();
  await coldClient.requestTransmit(["p2"]);
  coldClient.stopTransmit();
  console.log(`  cold: acquireCalls=${coldCapture.acquireCalls} releaseCalls=${coldCapture.releaseCalls} (매 송신마다 재획득)`);
  assert.equal(coldCapture.acquireCalls, 2);
  assert.equal(coldCapture.releaseCalls, 2);
  passed += 1;
  console.log("  ok — §7 warm(1 acquire)/cold(2 acquire) 동작 차이 확인");
}

console.log(`\n${passed} passed, 0 failed`);
