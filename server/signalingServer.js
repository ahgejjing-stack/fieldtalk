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

// RC4 Issue 4 (Host transfer) — how long the server waits after the
// HOST's socket drops before promoting a successor. This grace window is
// what reconciles "auto host transfer" with RC4 Session Recovery: a host
// who merely backgrounds the app / suffers a brief network blip and
// reconnects within the window keeps host; only a host who is really gone
// for the whole window is replaced. Configurable, defaults to 12s.
const HOST_TRANSFER_GRACE_MS = Number(process.env.HOST_TRANSFER_GRACE_MS) || 12000;

export function createSignalingServer({
  port = PORT,
  leaseDurationMs = LEASE_DURATION_MS,
  hostTransferGraceMs = HOST_TRANSFER_GRACE_MS,
} = {}) {
  const registry = new RoomRegistry();
  const lockManager = new PttLockManager({ leaseDurationMs });

  // RC4 Issue 4 — pending host-transfer timers, keyed by roomId. A timer
  // exists only while a room's host is within its post-disconnect grace
  // window. Cleared if the host reconnects, or when it fires.
  const hostTransferTimers = new Map();

  function cancelHostTransfer(roomId) {
    const timer = hostTransferTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      hostTransferTimers.delete(roomId);
    }
  }

  /** RC4 Issue 4 — promote a deterministic successor host and tell the
   * room. Called only when the grace window elapses with the old host
   * still absent. Safe if the room emptied in the meantime (no-op). */
  function performHostTransfer(roomId, previousHostUserId) {
    hostTransferTimers.delete(roomId);
    // If the old host came back and is host again, or the room is gone,
    // there is nothing to do.
    if (!registry.roomExists(roomId)) return;
    if (registry.getHostUserId(roomId) !== previousHostUserId) return; // already changed
    if (registry.isMember(roomId, previousHostUserId)) return; // host reconnected in time
    const successor = registry.pickSuccessorHost(roomId);
    if (!successor) return;
    const { changed, hostUserId } = registry.setHost(roomId, successor);
    if (!changed) return;
    log("[HOST TRANSFER]", { roomId, previousHostUserId, newHostUserId: hostUserId });
    registry.broadcast(roomId, {
      type: "host_changed",
      roomId,
      hostUserId,
      previousHostUserId,
      reason: "host_disconnected",
    });
  }

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

  wss.on("connection", (ws, req) => {
    // Filled in once this socket sends room_join — needed so socket
    // close can look up which (roomId, userId) to clean up without a
    // registry scan (registry.removeConnection still exists as a
    // fallback for safety).
    let boundRoomId = null;
    let boundUserId = null;

    const remoteAddress = req?.socket?.remoteAddress ?? "unknown";
    log("[CLIENT CONNECTED]", { remoteAddress });

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
          const { roomId, userId, displayName, deviceSessionId, requireExisting } = msg;
          log("[ROOM JOIN REQUEST]", { roomId, userId, displayName, requireExisting, remoteAddress });
          if (!roomId || !userId) {
            log("[ROOM JOIN FAILED]", { roomId, userId, reason: "missing_roomId_or_userId" });
            return;
          }
          // RC4 Session Recovery — a [계속하기] rejoin sets requireExisting:
          // true. If the room no longer has any connected members (ended /
          // expired), do NOT re-create an empty room — tell the client so it
          // can clear its stale activeRoomRef and return Home.
          if (requireExisting && !registry.roomExists(roomId)) {
            log("[ROOM JOIN DENIED]", { roomId, userId, reason: "room_not_active" });
            ws.send(JSON.stringify({ type: "room_join_denied", roomId, reason: "room_not_active" }));
            return;
          }
          registry.addMember(roomId, userId, ws, { displayName, deviceSessionId });
          boundRoomId = roomId;
          boundUserId = userId;
          // RC4 Issue 4 — if the reconnecting user IS the current host and
          // a transfer grace timer was pending for this room, they made it
          // back in time: cancel the transfer, host stays put. (If a
          // transfer already fired, this user is no longer host and there
          // is no timer to cancel — see "이전 Host가 recovery로 돌아왔을
          // 때 Host 권한을 자동으로 되찾지 않음".)
          if (registry.isHost(roomId, userId)) {
            cancelHostTransfer(roomId);
          }
          const hostUserId = registry.getHostUserId(roomId);
          const members = registry.getMembers(roomId);
          log("[ROOM JOIN SUCCESS]", { roomId, userId, participants: members.length, hostUserId });

          ws.send(
            JSON.stringify({
              type: "room_joined",
              roomId,
              members,
              hostUserId, // RC4 Issue 4 — clients learn the authoritative host on join
              currentSpeakerUserId: lockManager.getCurrentSpeaker(roomId),
            })
          );
          const broadcastCount = Math.max(members.length - 1, 0);
          log("[PEER JOIN BROADCAST]", { roomId, from: userId, recipients: broadcastCount });
          registry.broadcast(
            roomId,
            { type: "member_online", roomId, userId, displayName, hostUserId },
            userId
          );
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
          log("[PTT REQUEST]", { roomId, from: boundUserId, targets: validTargets, granted: result.granted });

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
          // RC4 diagnostic — Stage 2a: did the request reach the server?
          log("[SERVER] received round_start_request", { roomId, senderUserId: boundUserId, roundId, isHost: boundUserId ? registry.isHost(roomId, boundUserId) : false });
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
            log("[SERVER] round_start_denied invalid_payload", { roomId, hasRoundId: !!roundId, hasCourse: !!courseSnapshot, playerCount: Array.isArray(players) ? players.length : "not-array" });
            return;
          }
          // RC4 FIX (Founder-recommended) — do NOT trust the client-provided
          // players array as the roster. Build the round_started roster from
          // the SERVER-AUTHORITATIVE registry members. We still consult the
          // host's payload only to carry over display names when present
          // (falling back to the registry's own displayName), so a stale or
          // manipulated client roster can neither add phantom players nor
          // drop real ones.
          const registryMembers = registry.getMembers(roomId) ?? [];
          const registryMemberIds = registryMembers.map((m) => m.userId);
          const requestedPlayerIds = players.map((p) => p.id);
          const requestedById = new Map(players.map((p) => [p.id, p]));
          const authoritativePlayers = registryMembers.map((m) => ({
            id: m.userId,
            name: requestedById.get(m.userId)?.name ?? m.displayName ?? m.userId,
          }));
          const validPlayerIds = authoritativePlayers.map((p) => p.id);
          // RC4 diagnostic — [SERVER FILTER]: requested vs registry vs final
          // authoritative roster. A gap between requested and registry (e.g.
          // host built the round before the guest's membership registered)
          // is now harmless — the server roster is used regardless.
          log("[SERVER FILTER]", { roomId, requestedPlayerIds, registryMemberIds, validPlayerIds });

          // RC4 FIX (Founder-requested) — never broadcast an empty roster.
          // If the registry somehow has no members, deny explicitly rather
          // than broadcasting a round that would strand every client on the
          // pending/loading gate.
          if (authoritativePlayers.length === 0) {
            registry.sendTo(roomId, boundUserId, {
              type: "round_start_denied",
              roomId,
              reason: "invalid_roster",
            });
            log("[SERVER] round_start_denied invalid_roster", { roomId, requestedPlayerIds, registryMemberIds });
            return;
          }

          const payload = { type: "round_started", roomId, roundId, courseSnapshot, startHole, startedAt, players: authoritativePlayers };
          // RC4 diagnostic — Stage 2b: broadcasting to all members (incl host).
          log("[SERVER] broadcast round_started", { roomId, roundId, hostUserId: boundUserId, playerCount: authoritativePlayers.length, recipients: registryMemberIds });
          registry.broadcast(roomId, payload); // includes the host too, for a single symmetric code path
          break;
        }

        case "hole_sync": {
          // RC4 P1 defense — rejoin hole-state recovery. Host-only, same
          // reasoning as hole_advance: only the host's view of "what
          // hole are we actually on" is authoritative.
          const { roomId, currentHoleNumber, targetUserId } = msg;
          if (!boundRoomId || !boundUserId || roomId !== boundRoomId) return;
          if (!registry.isHost(roomId, boundUserId)) return; // silently ignore -- this is a background sync, not a user-facing action worth a denial toast
          log("[HOLE SYNC]", { roomId, from: boundUserId, currentHoleNumber, targetUserId });
          if (targetUserId) {
            registry.sendTo(roomId, targetUserId, { type: "hole_sync", roomId, currentHoleNumber });
          } else {
            registry.broadcast(roomId, { type: "hole_sync", roomId, currentHoleNumber }, boundUserId);
          }
          break;
        }

        case "hole_advance": {
          // RC4 P1 fix — hole progression was NEVER networked at all.
          // Whoever completes a hole locally also tells the room, same
          // broadcast-to-others pattern as distance_share/sound_played.
          // RC4 P1 defense review — host-only, same pattern as
          // round_start_request: advancing the WHOLE room's shared hole
          // state isn't something any individual guest should be able
          // to unilaterally force (server is the source of truth on
          // who's host, never the client's claim).
          const { roomId, completedHoleNumber, nextHoleNumber } = msg;
          if (!boundRoomId || !boundUserId || roomId !== boundRoomId) return;
          if (!registry.isHost(roomId, boundUserId)) {
            registry.sendTo(roomId, boundUserId, { type: "hole_advance_denied", roomId, reason: "not_host" });
            log("[HOLE ADVANCE DENIED]", { roomId, senderUserId: boundUserId, reason: "not_host" });
            return;
          }
          log("[HOLE ADVANCE]", { roomId, from: boundUserId, completedHoleNumber, nextHoleNumber });
          registry.broadcast(
            roomId,
            { type: "hole_advance", roomId, completedHoleNumber, nextHoleNumber, fromUserId: boundUserId },
            boundUserId
          );
          break;
        }

        case "sound_played": {
          // P0-5 fix — cheer/sound effects were never networked at all,
          // purely local playback. Same broadcast-to-others pattern as
          // distance_share. eventId lets the receiver ignore an exact
          // duplicate delivery (RC3 review §"중복 재생이 없는지").
          const { roomId, soundId, category, label, targetUserIds } = msg;
          if (!boundRoomId || !boundUserId || roomId !== boundRoomId) return;
          const eventId = `${boundUserId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          log("[SOUND PLAYED]", { roomId, from: boundUserId, soundId, targetUserIds, eventId });
          registry.broadcast(
            roomId,
            { type: "sound_played", roomId, soundId, category, label, actorUserId: boundUserId, targetUserIds, eventId },
            boundUserId
          );
          break;
        }

        case "distance_share": {
          // RC1 Networking Recovery — distance sharing was local-only
          // until now: DistanceCard dispatched straight into the local
          // Round Engine and never told the server, so teammates never
          // received it. Broadcasts to every OTHER room member — the
          // sender already applied it locally (excluding them avoids
          // double-applying their own share).
          const { roomId, referencePlayerId, referenceDistanceM, source, holeNumber } = msg;
          if (!boundRoomId || !boundUserId || roomId !== boundRoomId) return;
          if (referencePlayerId !== boundUserId) return; // can't claim to share as someone else
          if (typeof referenceDistanceM !== "number" || !Number.isFinite(referenceDistanceM)) return;
          log("[DISTANCE SHARE]", { roomId, referencePlayerId, referenceDistanceM, holeNumber });
          registry.broadcast(
            roomId,
            { type: "distance_share", roomId, referencePlayerId, referenceDistanceM, source, holeNumber },
            boundUserId
          );
          const distanceRecipients = Math.max((registry.getMembers(roomId)?.length ?? 1) - 1, 0);
          log("[DISTANCE SHARE BROADCAST]", { roomId, recipients: distanceRecipients });
          break;
        }

        case "room_leave": {
          // RC4 Issue 4 — a DELIBERATE leave. Unlike a socket drop, this
          // is never coming back, so if the leaver is host we transfer
          // immediately (no grace window). We remove membership here so
          // the successor pick excludes the leaver; the subsequent socket
          // close then finds nothing to clean up (removeConnection returns
          // null) and, crucially, sees wasHost=false so it won't also arm
          // a grace timer.
          const { roomId } = msg;
          if (!boundRoomId || !boundUserId || roomId !== boundRoomId) return;
          const leaverWasHost = registry.isHost(roomId, boundUserId);
          log("[ROOM LEAVE]", { roomId, userId: boundUserId, leaverWasHost });
          const wasSpeaker = lockManager.releaseIfHeldBy(roomId, boundUserId);
          registry.removeMember(roomId, boundUserId);
          if (wasSpeaker) {
            registry.broadcast(roomId, { type: "speaker_changed", roomId, speakerUserId: null, targetUserIds: [] });
          }
          registry.broadcast(roomId, { type: "member_offline", roomId, userId: boundUserId });
          if (leaverWasHost && registry.roomExists(roomId)) {
            cancelHostTransfer(roomId); // supersede any pending grace timer
            const successor = registry.pickSuccessorHost(roomId);
            if (successor) {
              const { changed, hostUserId } = registry.setHost(roomId, successor);
              if (changed) {
                log("[HOST TRANSFER — EXPLICIT LEAVE]", { roomId, previousHostUserId: boundUserId, newHostUserId: hostUserId });
                registry.broadcast(roomId, {
                  type: "host_changed",
                  roomId,
                  hostUserId,
                  previousHostUserId: boundUserId,
                  reason: "host_left",
                });
              }
            }
          }
          // Prevent the upcoming socket close from double-processing this
          // user (membership is already gone). Unbind so ws.on("close")
          // early-returns.
          boundRoomId = null;
          boundUserId = null;
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
      // RC4 Issue 4 — capture whether this socket was the host BEFORE we
      // remove it, and whether this exact socket is still the registered
      // one for that user (a newer reconnect may have replaced it under
      // last-connected-wins; if so, this stale close must NOT trigger a
      // transfer).
      let wasHost = false;
      let staleReplacedSocket = false;
      if (boundRoomId && boundUserId) {
        wasHost = registry.isHost(boundRoomId, boundUserId);
        const currentSocket = registry.getSocket(boundRoomId, boundUserId);
        staleReplacedSocket = currentSocket !== null && currentSocket !== ws;
      }

      const found = registry.removeConnection(ws) ?? (boundRoomId && boundUserId ? { roomId: boundRoomId, userId: boundUserId } : null);
      if (!found) return;
      const { roomId, userId } = found;
      const remainingParticipants = registry.getMembers(roomId)?.length ?? 0;
      log("[DISCONNECT]", { roomId, userId, remainingParticipants, wasHost });

      const wasSpeaker = lockManager.releaseIfHeldBy(roomId, userId);
      if (wasSpeaker) {
        registry.broadcast(roomId, { type: "speaker_changed", roomId, speakerUserId: null, targetUserIds: [] });
      }
      registry.broadcast(roomId, { type: "member_offline", roomId, userId });

      // RC4 Issue 4 (Host transfer with grace period) — only arm a
      // transfer if the HOST genuinely left and still has members to
      // inherit the room. A stale/replaced socket close is ignored (the
      // user is still connected on a newer socket). removeConnection above
      // already deleted the room entirely if it was the last member, so
      // roomExists() guards the "empty room" case.
      if (wasHost && !staleReplacedSocket && registry.roomExists(roomId)) {
        cancelHostTransfer(roomId); // never stack two timers for one room
        log("[HOST DISCONNECTED — GRACE START]", { roomId, hostUserId: userId, graceMs: hostTransferGraceMs });
        const timer = setTimeout(() => performHostTransfer(roomId, userId), hostTransferGraceMs);
        if (typeof timer.unref === "function") timer.unref(); // don't keep the process alive on this timer alone
        hostTransferTimers.set(roomId, timer);
      }
    });
  });

  return { wss, registry, lockManager, port };
}

// Only auto-start when run directly (`node server/signalingServer.js`),
// not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  createSignalingServer();
}
