/**
 * hostTransfer.test.js
 * ------------------------------------------------------------------
 * RC4 Issue 4 (Host transfer, Option A) — unit tests for the
 * deterministic host-succession logic on RoomRegistry, plus a couple of
 * integration-style checks of the signaling server's grace-period vs
 * explicit-leave behaviour using a fake in-process socket.
 *
 * Run directly with: node server/hostTransfer.test.js
 * ------------------------------------------------------------------
 */
import assert from "node:assert/strict";
import { RoomRegistry } from "./roomRegistry.js";

let passed = 0;
function test(name, fn) {
  return (async () => {
    await fn();
    passed += 1;
    console.log(`  ok — ${name}`);
  })();
}

const ws = () => ({ sent: [], send(m) { this.sent.push(JSON.parse(m)); } });

console.log("hostTransfer.test.js");

await test("H1. first joiner is host; later joiners are not", () => {
  const r = new RoomRegistry();
  r.addMember("room1", "A", ws(), { displayName: "A", deviceSessionId: "d1" });
  r.addMember("room1", "B", ws(), { displayName: "B", deviceSessionId: "d2" });
  assert.equal(r.getHostUserId("room1"), "A");
  assert.equal(r.isHost("room1", "A"), true);
  assert.equal(r.isHost("room1", "B"), false);
});

await test("H2. pickSuccessorHost = longest-connected remaining member", () => {
  const r = new RoomRegistry();
  r.addMember("room1", "A", ws(), { displayName: "A", deviceSessionId: "d1" }); // host, seq 0
  r.addMember("room1", "B", ws(), { displayName: "B", deviceSessionId: "d2" }); // seq 1
  r.addMember("room1", "C", ws(), { displayName: "C", deviceSessionId: "d3" }); // seq 2
  // host A leaves the registry
  r.removeMember("room1", "A");
  assert.equal(r.pickSuccessorHost("room1"), "B"); // smallest remaining joinSeq
});

await test("H3. successor is deterministic regardless of Map churn", () => {
  const r = new RoomRegistry();
  r.addMember("room1", "A", ws(), { displayName: "A", deviceSessionId: "d1" });
  r.addMember("room1", "B", ws(), { displayName: "B", deviceSessionId: "d2" });
  r.addMember("room1", "C", ws(), { displayName: "C", deviceSessionId: "d3" });
  // B reconnects (delete+set) — must NOT lose seniority to C
  r.addMember("room1", "B", ws(), { displayName: "B", deviceSessionId: "d2b" });
  r.removeMember("room1", "A");
  assert.equal(r.pickSuccessorHost("room1"), "B");
});

await test("H4. setHost is idempotent and member-guarded", () => {
  const r = new RoomRegistry();
  r.addMember("room1", "A", ws(), { displayName: "A", deviceSessionId: "d1" });
  r.addMember("room1", "B", ws(), { displayName: "B", deviceSessionId: "d2" });
  assert.deepEqual(r.setHost("room1", "A"), { changed: false, hostUserId: "A" }); // same host
  assert.deepEqual(r.setHost("room1", "ghost"), { changed: false, hostUserId: "A" }); // non-member
  assert.deepEqual(r.setHost("room1", "B"), { changed: true, hostUserId: "B" });
  assert.equal(r.getHostUserId("room1"), "B");
});

await test("H5. old host reconnecting does NOT auto-reclaim host", () => {
  const r = new RoomRegistry();
  r.addMember("room1", "A", ws(), { displayName: "A", deviceSessionId: "d1" });
  r.addMember("room1", "B", ws(), { displayName: "B", deviceSessionId: "d2" });
  r.removeMember("room1", "A");               // host A gone
  r.setHost("room1", r.pickSuccessorHost("room1")); // -> B
  r.addMember("room1", "A", ws(), { displayName: "A", deviceSessionId: "d1b" }); // A returns
  assert.equal(r.getHostUserId("room1"), "B"); // still B, no auto-reclaim
});

await test("H6. no duplicate host — exactly one hostUserId at all times", () => {
  const r = new RoomRegistry();
  r.addMember("room1", "A", ws(), { displayName: "A", deviceSessionId: "d1" });
  r.addMember("room1", "B", ws(), { displayName: "B", deviceSessionId: "d2" });
  r.removeMember("room1", "A");
  r.setHost("room1", r.pickSuccessorHost("room1"));
  const host = r.getHostUserId("room1");
  const hostsAmongMembers = r.getMembers("room1").filter((m) => r.isHost("room1", m.userId));
  assert.equal(hostsAmongMembers.length, 1);
  assert.equal(host, "B");
});

await test("H7. empty room -> no successor (room deleted on last leave)", () => {
  const r = new RoomRegistry();
  r.addMember("room1", "A", ws(), { displayName: "A", deviceSessionId: "d1" });
  r.removeMember("room1", "A"); // last member -> room removed
  assert.equal(r.roomExists("room1"), false);
  assert.equal(r.pickSuccessorHost("room1"), null);
});

// ---- Integration: grace vs explicit leave via the real server + fake sockets ----
import { createSignalingServer } from "./signalingServer.js";

function fakeSocket() {
  const s = {
    _handlers: {},
    sent: [],
    on(ev, fn) { s._handlers[ev] = fn; },
    emit(ev, arg) { s._handlers[ev]?.(arg); },
    send(raw) { s.sent.push(JSON.parse(raw)); },
    close() { s.emit("close"); },
    messagesOfType(t) { return s.sent.filter((m) => m.type === t); },
  };
  return s;
}

// Build a server without binding a real port by calling the wss connection
// handler directly. We can't easily construct MiniWebSocketServer without a
// port, so we instead spin up on an ephemeral port and drive fake client
// sockets through the same registry/lock — but the handler is closed over
// `wss.on("connection")`. Simplest: start the server on port 0-ish high port.
await test("H8. explicit room_leave transfers host immediately", async () => {
  const srv = createSignalingServer({ port: 18790, hostTransferGraceMs: 10_000 });
  const host = fakeSocket();
  const guest = fakeSocket();
  // Simulate two connections by invoking the connection handler through the
  // MiniWebSocketServer's EventEmitter interface.
  srv.wss.emit("connection", host, { socket: { remoteAddress: "h" } });
  srv.wss.emit("connection", guest, { socket: { remoteAddress: "g" } });

  host.emit("message", JSON.stringify({ type: "room_join", roomId: "R", userId: "A", displayName: "A", deviceSessionId: "d1" }));
  guest.emit("message", JSON.stringify({ type: "room_join", roomId: "R", userId: "B", displayName: "B", deviceSessionId: "d2" }));
  assert.equal(srv.registry.getHostUserId("R"), "A");

  // Host explicitly leaves
  host.emit("message", JSON.stringify({ type: "room_leave", roomId: "R", userId: "A" }));
  assert.equal(srv.registry.getHostUserId("R"), "B"); // immediate
  const hc = guest.messagesOfType("host_changed");
  assert.equal(hc.length, 1);
  assert.equal(hc[0].hostUserId, "B");
  assert.equal(hc[0].reason, "host_left");
  srv.wss.close?.();
});

await test("H9. host socket drop transfers only AFTER grace window", async () => {
  const srv = createSignalingServer({ port: 18791, hostTransferGraceMs: 40 });
  const host = fakeSocket();
  const guest = fakeSocket();
  srv.wss.emit("connection", host, { socket: { remoteAddress: "h" } });
  srv.wss.emit("connection", guest, { socket: { remoteAddress: "g" } });
  host.emit("message", JSON.stringify({ type: "room_join", roomId: "R", userId: "A", displayName: "A", deviceSessionId: "d1" }));
  guest.emit("message", JSON.stringify({ type: "room_join", roomId: "R", userId: "B", displayName: "B", deviceSessionId: "d2" }));

  host.close(); // involuntary drop
  assert.equal(srv.registry.getHostUserId("R"), "A"); // not yet — still in grace
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(srv.registry.getHostUserId("R"), "B"); // promoted after grace
  srv.wss.close?.();
});

await test("H10. host reconnect within grace keeps host (no transfer)", async () => {
  const srv = createSignalingServer({ port: 18792, hostTransferGraceMs: 60 });
  const host = fakeSocket();
  const guest = fakeSocket();
  srv.wss.emit("connection", host, { socket: { remoteAddress: "h" } });
  srv.wss.emit("connection", guest, { socket: { remoteAddress: "g" } });
  host.emit("message", JSON.stringify({ type: "room_join", roomId: "R", userId: "A", displayName: "A", deviceSessionId: "d1" }));
  guest.emit("message", JSON.stringify({ type: "room_join", roomId: "R", userId: "B", displayName: "B", deviceSessionId: "d2" }));

  host.close(); // drop
  // reconnect quickly on a NEW socket, before the 60ms window elapses
  const host2 = fakeSocket();
  srv.wss.emit("connection", host2, { socket: { remoteAddress: "h2" } });
  host2.emit("message", JSON.stringify({ type: "room_join", roomId: "R", userId: "A", displayName: "A", deviceSessionId: "d1" }));

  await new Promise((r) => setTimeout(r, 100));
  assert.equal(srv.registry.getHostUserId("R"), "A"); // kept host
  assert.equal(guest.messagesOfType("host_changed").length, 0);
  srv.wss.close?.();
});

console.log(`\n${passed} passed, 0 failed`);
