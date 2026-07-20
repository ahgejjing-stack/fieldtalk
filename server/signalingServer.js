/**
 * signalingServer.js
 * ------------------------------------------------------------------
 * Two Device PTT Foundation v0.1 §6/§11 — the signaling server. Relays
 * WebRTC offer/answer/ICE between exactly the two peers involved, and
 * owns the single-speaker PTT lock per room (§3) so the "one speaker at
 * a time" rule holds regardless of the media transport underneath.
 *
 * Run with: node server/signalingServer.js
 * Configuration via environment variables (§11 — "비밀값을 클라이언트
 * 코드에 하드코딩하지 마세요"; there are no secrets in this Prototype,
 * but the port/lease ARE configurable rather than hardcoded):
 *   SIGNALING_PORT          default 8787
 *   PTT_LEASE_DURATION_MS   default 60000 (see pttLockManager.js)
 * ------------------------------------------------------------------
 */
import { MiniWebSocketServer } from "./miniWebSocketServer.js";
import { RoomRegistry } from "./roomRegistry.js";
import { PttLockManager, DEFAULT_LEASE_DURATION_MS } from "./pttLockManager.js";

// Render (and most PaaS hosts) assign a port via process.env.PORT and
// require the app to bind to it — SIGNALING_PORT stays as the existing
// local-dev override, now second priority instead of the only one.
const PORT = Number(process.env.PORT) || Number(process.env.SIGNALING_PORT) || 8787;
const LEASE_DURATION_MS = Number(process.env.PTT_LEASE_DURATION_MS) || DEFAULT_LEASE_DURATION_MS;

export function createSignalingServer({ port = PORT, leaseDurationMs = LEASE_DURATION_MS } = {}) {
  const registry = new RoomRegistry();
  const lockManager = new PttLockManager({ leaseDurationMs });

  function log(...args) {
    // §13 deliverable 11 "서버 로그 예시" — plain console output,
    // never includes audio/media content (there isn't any at this layer
    // — this server only ever relays SDP/ICE JSON control payloads).
    console.log(new Date().toISOString(), ...args);
  }

  lockManager.onExpired = (roomId, userId) => {
    log("ptt_expired", { roomId, userId });
    registry.sendTo(roomId, userId, { type: "ptt_expired", roomId, requestId: null });
    registry.broadcast(roomId, { type: "speaker_changed", roomId, speakerUserId: null, targetUserIds: [] });
  };

  const wss = new MiniWebSocketServer({ port });
  log(`signaling server listening on ws://localhost:${port} (PTT lease ${leaseDurationMs}ms)`);

  wss.on("connection", (ws) => {
    // Filled in once this socket sends room_join — needed so socket
    // close can look up which (roomId, userId) to clean up without a
    // registry scan (registry.removeConnection still exists as a
    // fallback for safety).
    let boundRoomId = null;
    let boundUserId = null;

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch (err) {
        return; // ignore malformed input — never crash the server on bad client data
      }
      if (!msg || typeof msg.type !== "string") return;

      switch (msg.type) {
        case "room_join": {
          const { roomId, userId, displayName, deviceSessionId } = msg;
          if (!roomId || !userId) return;
          registry.addMember(roomId, userId, ws, { displayName, deviceSessionId });
          boundRoomId = roomId;
          boundUserId = userId;
          log("room_join", { roomId, userId, displayName, deviceSessionId });

          ws.send(
            JSON.stringify({
              type: "room_joined",
              roomId,
              members: registry.getMembers(roomId),
              currentSpeakerUserId: lockManager.getCurrentSpeaker(roomId),
            })
          );
          registry.broadcast(roomId, { type: "member_online", roomId, userId, displayName }, userId);
          break;
        }

        case "offer":
        case "answer":
        case "ice_candidate": {
          // §6: relay only — never trust senderUserId blindly, always
          // use the roomId/userId this SOCKET actually joined as, so a
          // client can't spoof messages as a different user.
          const { roomId, targetUserId } = msg;
          if (!boundRoomId || !boundUserId || roomId !== boundRoomId) return;
          if (!registry.isMember(roomId, targetUserId)) return;
          registry.sendTo(roomId, targetUserId, { ...msg, senderUserId: boundUserId });
          break;
        }

        case "ptt_request": {
          const { roomId, targetUserIds, requestId } = msg;
          if (!boundRoomId || !boundUserId || roomId !== boundRoomId) return;
          // §3: "client가 임의 target을 보내도 Room membership 검증" —
          // non-member targets are silently dropped, not an error.
          const validTargets = (targetUserIds ?? []).filter((id) => registry.isMember(roomId, id));
          const result = lockManager.requestLock(roomId, boundUserId);
          log("ptt_request", { roomId, senderUserId: boundUserId, targetUserIds: validTargets, requestId, granted: result.granted });

          if (result.granted) {
            registry.sendTo(roomId, boundUserId, { type: "ptt_granted", roomId, requestId });
            registry.broadcast(roomId, {
              type: "speaker_changed",
              roomId,
              speakerUserId: boundUserId,
              targetUserIds: validTargets,
            });
          } else {
            registry.sendTo(roomId, boundUserId, { type: "ptt_denied", roomId, requestId, reason: result.reason });
          }
          break;
        }

        case "ptt_release": {
          const { roomId, requestId } = msg;
          if (!boundRoomId || !boundUserId || roomId !== boundRoomId) return;
          const released = lockManager.release(roomId, boundUserId);
          log("ptt_release", { roomId, senderUserId: boundUserId, requestId, released });
          if (released) {
            registry.sendTo(roomId, boundUserId, { type: "ptt_released", roomId, requestId });
            registry.broadcast(roomId, { type: "speaker_changed", roomId, speakerUserId: null, targetUserIds: [] });
          }
          break;
        }

        case "round_start_request": {
          // Runtime Identity v0.4 §9/§14 — "Host만 round_start 가능",
          // validated server-side against THIS SOCKET's bound identity,
          // never the client's claimed senderUserId.
          const { roomId, roundId, courseSnapshot, startHole, startedAt, players } = msg;
          if (!boundRoomId || !boundUserId || roomId !== boundRoomId) return;
          if (!registry.isHost(roomId, boundUserId)) {
            registry.sendTo(roomId, boundUserId, {
              type: "round_start_denied",
              roomId,
              reason: "not_host",
            });
            log("round_start_denied", { roomId, senderUserId: boundUserId, reason: "not_host" });
            return;
          }
          // §9 "payload 최소 validation" — reject obviously malformed
          // payloads rather than relaying garbage to other members.
          if (!roundId || !courseSnapshot || !Array.isArray(players) || players.length === 0) {
            registry.sendTo(roomId, boundUserId, {
              type: "round_start_denied",
              roomId,
              reason: "invalid_payload",
            });
            return;
          }
          // Only players who are actual current room members are trusted
          // — a host can't claim a non-member is playing.
          const validPlayers = players.filter((p) => registry.isMember(roomId, p.id));
          const payload = { type: "round_started", roomId, roundId, courseSnapshot, startHole, startedAt, players: validPlayers };
          log("round_started", { roomId, roundId, hostUserId: boundUserId, playerCount: validPlayers.length });
          registry.broadcast(roomId, payload); // includes the host too, for a single symmetric code path
          break;
        }

        case "connection_state": {
          // Informational relay only — clients use this to show hints
          // like "상대방 연결 불안정", never a control message the
          // server acts on.
          const { roomId, state } = msg;
          if (!boundRoomId || !boundUserId || roomId !== boundRoomId) return;
          registry.broadcast(roomId, { type: "connection_state", roomId, userId: boundUserId, state }, boundUserId);
          break;
        }

        default:
          break; // unknown message type — ignore rather than crash
      }
    });

    ws.on("close", () => {
      const found = registry.removeConnection(ws) ?? (boundRoomId && boundUserId ? { roomId: boundRoomId, userId: boundUserId } : null);
      if (!found) return;
      const { roomId, userId } = found;
      log("disconnect", { roomId, userId });

      const wasSpeaker = lockManager.releaseIfHeldBy(roomId, userId);
      if (wasSpeaker) {
        registry.broadcast(roomId, { type: "speaker_changed", roomId, speakerUserId: null, targetUserIds: [] });
      }
      registry.broadcast(roomId, { type: "member_offline", roomId, userId });
    });
  });

  return { wss, registry, lockManager, port };
}

// Only auto-start when run directly (`node server/signalingServer.js`),
// not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  createSignalingServer();
}
