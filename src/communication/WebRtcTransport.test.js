/**
 * WebRtcTransport.test.js
 * ------------------------------------------------------------------
 * Two Device PTT Bidirectional Hardening v0.2 Part C — tests the REAL
 * WebRtcTransport.js queue/flush logic (NetworkPttClient.test.js's test
 * 8 exercises a test-mock's approximation of this; this file tests the
 * actual class). Stubs `global.RTCPeerConnection` minimally since Node
 * has no WebRTC implementation.
 *
 * Run directly with: node src/communication/WebRtcTransport.test.js
 * ------------------------------------------------------------------
 */
import assert from "node:assert/strict";

class StubPeerConnection {
  constructor() {
    this.addIceCandidateCalls = [];
    this.setRemoteDescriptionCalls = [];
    this.localDescription = null;
    this.remoteDescription = null;
    this.connectionState = "new";
    this.onicecandidate = null;
    this.ontrack = null;
    this.onconnectionstatechange = null;
  }
  addTrack() {}
  async createOffer() {
    return { type: "offer", sdp: "stub" };
  }
  async createAnswer() {
    return { type: "answer", sdp: "stub" };
  }
  async setLocalDescription(desc) {
    this.localDescription = desc;
  }
  async setRemoteDescription(desc) {
    this.remoteDescription = desc;
    this.setRemoteDescriptionCalls.push(desc);
  }
  async addIceCandidate(candidate) {
    this.addIceCandidateCalls.push(candidate);
  }
  close() {
    this.connectionState = "closed";
  }
}

globalThis.RTCPeerConnection = StubPeerConnection;

const { WebRtcTransport } = await import("./WebRtcTransport.js");

let passed = 0;
function test(name, fn) {
  return (async () => {
    await fn();
    passed += 1;
    console.log(`  ok — ${name}`);
  })();
}

console.log("WebRtcTransport.test.js");

await test("candidate가 remoteDescription 설정 전 도착하면 pc.addIceCandidate가 아직 호출되지 않는다", async () => {
  const transport = new WebRtcTransport({
    onIceCandidate: () => {},
    onRemoteTrack: () => {},
    onConnectionStateChange: () => {},
  });
  const result = await transport.addIceCandidate({ candidate: "early" });
  assert.equal(result.queued, true);
  assert.equal(transport.pc.addIceCandidateCalls.length, 0);
});

await test("setRemoteAnswer 이후 큐에 쌓인 candidate가 순서대로 적용된다", async () => {
  const transport = new WebRtcTransport({
    onIceCandidate: () => {},
    onRemoteTrack: () => {},
    onConnectionStateChange: () => {},
  });
  await transport.addIceCandidate({ candidate: "c1" });
  await transport.addIceCandidate({ candidate: "c2" });
  assert.equal(transport.pc.addIceCandidateCalls.length, 0);

  await transport.setRemoteAnswer({ type: "answer", sdp: "x" });

  assert.equal(transport.pc.addIceCandidateCalls.length, 2);
  assert.deepEqual(
    transport.pc.addIceCandidateCalls.map((c) => c.candidate),
    ["c1", "c2"]
  );
});

await test("remoteDescription 설정 후 도착한 candidate는 즉시 적용된다", async () => {
  const transport = new WebRtcTransport({
    onIceCandidate: () => {},
    onRemoteTrack: () => {},
    onConnectionStateChange: () => {},
  });
  await transport.setRemoteAnswer({ type: "answer", sdp: "x" });
  const result = await transport.addIceCandidate({ candidate: "late" });
  assert.equal(result.applied, true);
  assert.equal(transport.pc.addIceCandidateCalls.length, 1);
});

await test("createAnswerFor도 동일하게 큐를 flush한다 (answerer 경로)", async () => {
  const transport = new WebRtcTransport({
    onIceCandidate: () => {},
    onRemoteTrack: () => {},
    onConnectionStateChange: () => {},
  });
  await transport.addIceCandidate({ candidate: "pre-offer" });
  await transport.createAnswerFor({ type: "offer", sdp: "x" });
  assert.equal(transport.pc.addIceCandidateCalls.length, 1);
});

await test("close() 시 남은 큐가 정리된다", async () => {
  const transport = new WebRtcTransport({
    onIceCandidate: () => {},
    onRemoteTrack: () => {},
    onConnectionStateChange: () => {},
  });
  await transport.addIceCandidate({ candidate: "never-flushed" });
  transport.close();
  assert.equal(transport._pendingCandidates.length, 0);
});

await test("close()는 중복 호출해도 안전하다", async () => {
  const transport = new WebRtcTransport({
    onIceCandidate: () => {},
    onRemoteTrack: () => {},
    onConnectionStateChange: () => {},
  });
  transport.close();
  transport.close(); // must not throw
  assert.equal(transport._closed, true);
});

console.log(`\n${passed} passed, 0 failed`);
