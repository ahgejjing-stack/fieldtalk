/**
 * NetworkPttClient.repeatedTransmission.test.js
 * ------------------------------------------------------------------
 * Two Device PTT Repeated Transmission Hotfix v0.3 §9 — the 6 required
 * unit tests, using a stubbed `global.AudioContext`/`AnalyserNode` (Node
 * has neither) so the ACTUAL analyser/AudioContext creation and teardown
 * counts can be verified precisely, not just the higher-level state
 * transitions NetworkPttClient.test.js already covers.
 *
 * Run directly with: node src/communication/NetworkPttClient.repeatedTransmission.test.js
 * ------------------------------------------------------------------
 */
import assert from "node:assert/strict";

// ---- Minimal AudioContext/AnalyserNode stub (Node has neither) ----
let audioContextInstancesCreated = 0;
let audioContextInstancesClosed = 0;

class StubAnalyserNode {
  constructor() {
    this.fftSize = 2048;
    this.frequencyBinCount = 1024;
    this._connected = false;
  }
  getByteTimeDomainData(arr) {
    arr.fill(128); // silence by default; tests override via the source's push mechanism if needed
  }
}
class StubMediaStreamSource {
  connect(destination) {
    destination._connected = true;
  }
}
class StubAudioContext {
  constructor() {
    audioContextInstancesCreated += 1;
    this.closed = false;
  }
  createMediaStreamSource() {
    return new StubMediaStreamSource();
  }
  createAnalyser() {
    return new StubAnalyserNode();
  }
  async close() {
    this.closed = true;
    audioContextInstancesClosed += 1;
  }
}
globalThis.window = globalThis.window ?? {};
globalThis.window.AudioContext = StubAudioContext;
globalThis.document = globalThis.document ?? {
  createElement: () => ({ play: async () => {}, pause: () => {}, srcObject: null, autoplay: false }),
};

const { NetworkPttClient } = await import("./NetworkPttClient.js");
const { AudioCapture } = await import("./AudioCapture.js");

let passed = 0;
function test(name, fn) {
  return (async () => {
    audioContextInstancesCreated = 0;
    audioContextInstancesClosed = 0;
    await fn();
    passed += 1;
    console.log(`  ok — ${name}`);
  })();
}

class MockAudioCapture extends AudioCapture {
  constructor() {
    super();
    this.stream = { getAudioTracks: () => [{ enabled: false }] };
    this.active = false;
  }
  async acquire() {}
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
    this.active = false;
  }
}

class MockSignalingClient {
  constructor() {
    this._listeners = new Map();
    this.calls = [];
  }
  on(type, handler) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(handler);
    return () => {};
  }
  emit(type, payload) {
    this._listeners.get(type)?.forEach((h) => h(payload));
  }
  async connect() {}
  join() {}
  async requestPtt() {
    return { type: "ptt_granted" };
  }
  releasePtt() {
    this.calls.push("releasePtt");
  }
  sendOffer() {}
  sendAnswer() {}
  sendIceCandidate() {}
  sendConnectionState() {}
  close() {}
}

class MockWebRtcTransport {
  constructor(handlers) {
    this.handlers = handlers;
    this.closed = false;
  }
  addLocalTrack() {}
  async createOffer() {
    return {};
  }
  async createAnswerFor() {
    return {};
  }
  async setRemoteAnswer() {}
  async addIceCandidate() {}
  simulateRemoteTrack(stream) {
    this.handlers.onRemoteTrack(stream);
  }
  simulateTrackEnded() {
    this.handlers.onTrackEnded();
  }
  close() {
    this.closed = true;
  }
}

function makeClient() {
  return new NetworkPttClient({
    audioCapture: new MockAudioCapture(),
    signalingClient: new MockSignalingClient(),
    identity: { roomId: "r1", userId: "player_jaesik", displayName: "재식", deviceSessionId: "d1" },
    WebRtcTransportClass: MockWebRtcTransport,
  });
}

console.log("NetworkPttClient.repeatedTransmission.test.js");

await test("1. speaker_changed(null) — receiver UI state만 초기화, remote media teardown 호출 안 됨 (AudioContext 안 닫힘)", async () => {
  const client = makeClient();
  client.signaling.emit("offer", { senderUserId: "player_jaegeun", sdp: {} });
  await new Promise((r) => setTimeout(r, 10));
  const transport = client._transports.get("player_jaegeun");
  transport.simulateRemoteTrack({ getAudioTracks: () => [{}] });

  assert.equal(audioContextInstancesCreated, 1); // analyser set up once on ontrack

  client.signaling.emit("speaker_changed", { speakerUserId: "player_jaegeun", targetUserIds: ["player_jaesik"] });
  assert.equal(client.getState().isReceiving, true);

  client.signaling.emit("speaker_changed", { speakerUserId: null, targetUserIds: [] });
  assert.equal(client.getState().isReceiving, false);
  assert.equal(client.getState().remoteSpeakerUserId, null);

  // THE core fix: the AudioContext must NOT have been closed by an
  // ordinary PTT end.
  assert.equal(audioContextInstancesClosed, 0);
  assert.notEqual(client._remoteAnalyserCtx, null); // pipeline still alive
});

await test("2. repeated speaker_changed — 같은 remote stream/analyser 재사용 (AudioContext 재생성 없음)", async () => {
  const client = makeClient();
  client.signaling.emit("offer", { senderUserId: "player_jaegeun", sdp: {} });
  await new Promise((r) => setTimeout(r, 10));
  const transport = client._transports.get("player_jaegeun");
  transport.simulateRemoteTrack({ getAudioTracks: () => [{}] });
  assert.equal(audioContextInstancesCreated, 1);

  for (let i = 0; i < 5; i += 1) {
    client.signaling.emit("speaker_changed", { speakerUserId: "player_jaegeun", targetUserIds: ["player_jaesik"] });
    assert.equal(client.getState().isReceiving, true);
    client.signaling.emit("speaker_changed", { speakerUserId: null, targetUserIds: [] });
    assert.equal(client.getState().isReceiving, false);
  }

  // Still exactly ONE AudioContext ever created across 5 repeated
  // speaker_changed cycles — proves the analyser is reused, not rebuilt.
  assert.equal(audioContextInstancesCreated, 1);
  assert.equal(audioContextInstancesClosed, 0);
});

await test("3. member_offline — remote media 완전 teardown (AudioContext close 호출됨)", async () => {
  const client = makeClient();
  client.signaling.emit("offer", { senderUserId: "player_jaegeun", sdp: {} });
  await new Promise((r) => setTimeout(r, 10));
  const transport = client._transports.get("player_jaegeun");
  transport.simulateRemoteTrack({ getAudioTracks: () => [{}] });
  client.signaling.emit("speaker_changed", { speakerUserId: "player_jaegeun", targetUserIds: ["player_jaesik"] });

  client.signaling.emit("member_offline", { userId: "player_jaegeun" });
  await new Promise((r) => setTimeout(r, 5));

  assert.equal(audioContextInstancesClosed, 1);
  assert.equal(client._remoteAnalyserCtx, null);
  assert.equal(client.getState().isReceiving, false);
});

await test("4. remote track ended — remote media 완전 teardown", async () => {
  const client = makeClient();
  client.signaling.emit("offer", { senderUserId: "player_jaegeun", sdp: {} });
  await new Promise((r) => setTimeout(r, 10));
  const transport = client._transports.get("player_jaegeun");
  transport.simulateRemoteTrack({ getAudioTracks: () => [{}] });
  client.signaling.emit("speaker_changed", { speakerUserId: "player_jaegeun", targetUserIds: ["player_jaesik"] });

  transport.simulateTrackEnded();
  await new Promise((r) => setTimeout(r, 5));

  assert.equal(audioContextInstancesClosed, 1);
  assert.equal(client._remoteAnalyserCtx, null);
  assert.equal(client.getState().isReceiving, false);
  assert.equal(client.getState().remoteSpeakerUserId, null);
});

await test("5. connection cleanup(_cleanupConnection) — joined false, transports/timers 정리, remote media teardown", async () => {
  const client = makeClient();
  client.signaling.emit("offer", { senderUserId: "player_jaegeun", sdp: {} });
  await new Promise((r) => setTimeout(r, 10));
  const transport = client._transports.get("player_jaegeun");
  transport.simulateRemoteTrack({ getAudioTracks: () => [{}] });
  client.signaling.emit("speaker_changed", { speakerUserId: "player_jaegeun", targetUserIds: ["player_jaesik"] });

  client._joined = true;
  client.signaling.emit("socket_closed", {});

  assert.equal(client._joined, false, "connectToRoom's own join-pending path resets this, but socket_closed's cleanup should not leave a stale joined=true");
  assert.equal(client._transports.size, 0);
  assert.equal(client._disconnectedTimers.size, 0);
  assert.equal(audioContextInstancesClosed, 1);
  assert.equal(client.getState().connectionState, "disconnected");
});

await test("6. lease expiry(ptt_expired) — transmitting false, 다음 송신 가능", async () => {
  const client = makeClient();
  const result = await client.requestTransmit(["player_jaegeun"]);
  assert.equal(result.ok, true);
  assert.equal(client.audioCapture.active, true);

  client.signaling.emit("ptt_expired", {});
  assert.equal(client.audioCapture.active, false);
  assert.notEqual(client.getState().status, "transmitting");

  // Next PTT press must succeed normally after the expiry.
  const result2 = await client.requestTransmit(["player_jaegeun"]);
  assert.equal(result2.ok, true);
  assert.equal(client.audioCapture.active, true);
  client.stopTransmit();
});

console.log(`\n${passed} passed, 0 failed`);
