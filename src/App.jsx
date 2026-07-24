import React, { useEffect, useRef, useState } from "react";
import StatusBar from "./components/StatusBar.jsx";
import SplashScreen from "./components/SplashScreen.jsx";
import HomeScreen from "./components/HomeScreen.jsx";
import RoundScreen from "./components/RoundScreen.jsx";
import TwoDeviceTestScreen from "./components/TwoDeviceTestScreen.jsx";
import IdentitySelectScreen from "./components/IdentitySelectScreen.jsx";
import RoundProvider from "./context/RoundProvider.jsx";
import { useRound } from "./context/useRound.js";
import { RuntimeModeProvider, useRuntimeMode } from "./context/RuntimeModeContext.jsx";
import RoomProvider from "./context/RoomProvider.jsx";
import { useRoom } from "./context/useRoom.js";
import { CommunicationProvider } from "./context/CommunicationProvider.jsx";
import { COMMUNICATION_MODES } from "./config/communicationMode.js";
import { IdentityProvider } from "./context/IdentityProvider.jsx";
import { useIdentity } from "./context/useIdentity.js";
import { DEFAULT_IDENTITY_USER_ID } from "./identity/runtimeIdentity.js";
import NameEntryScreen from "./components/NameEntryScreen.jsx";
import P0DebugOverlay from "./components/P0DebugOverlay.jsx";

const isDevModeTopLevel = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;
import { useCommunication } from "./context/useCommunication.js";
import { buildInitialRoundFromRoom } from "./room/buildInitialRoundFromRoom.js";
// RC4 Session Recovery — minimal active-room reference (roomId/userId/
// roundId/...), persisted separately from full room state so an
// interruption can offer [계속하기] without restoring stale members.
import { saveActiveRoomRef, clearActiveRoomRef } from "./room/activeRoomRef.js";
import { RC4_BUILD_STAMP } from "./config/buildStamp.js";
import { installDiagLog } from "./config/diagLog.js";
import { clearRoomState } from "./room/roomStorage.js";
import { createNetworkRoundState, createRoundSeed } from "./data/roundSeed.js";
// RC4 P1-1 — reuse the EXISTING audio engine (same function GalleryPanel's
// sender path calls via useAudioEngine), not a second playback path.
import { playSoundById } from "./services/audioEngine.js";

function resolveDefaultSignalingUrl() {  const isHttpsPage = typeof window !== "undefined" && window.location && window.location.protocol === "https:";

  const envUrl = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_SIGNALING_URL;
  if (envUrl) {
    // Mixed Content protection: an HTTPS page can never open a plain
    // ws:// connection — the browser blocks it outright, silently, with
    // no error the user would ever see. If VITE_SIGNALING_URL was ever
    // misconfigured as ws:// for an HTTPS deployment, upgrade it rather
    // than fail invisibly.
    if (isHttpsPage && envUrl.startsWith("ws://")) return envUrl.replace(/^ws:\/\//, "wss://");
    return envUrl; // explicit override always wins (production/Vercel+Render)
  }

  // Real-device LAN testing fix: a hardcoded "localhost" fallback is
  // device-relative — it silently fails on every phone except whichever
  // single machine happens to be running the signaling server itself.
  // Deriving from window.location.hostname instead means: loaded the
  // page via http://localhost:5173 -> ws://localhost:8787 (unchanged
  // behavior); loaded via http://192.168.x.x:5173 (a phone on the same
  // LAN, via Vite's "Network:" URL) -> ws://192.168.x.x:8787
  // automatically, no .env file or manual IP entry required.
  if (typeof window !== "undefined" && window.location && window.location.hostname) {
    const scheme = isHttpsPage ? "wss" : "ws";
    return `${scheme}://${window.location.hostname}:8787`;
  }
  return "ws://localhost:8787";
}
installDiagLog(); // RC4 — capture tagged diagnostics for on-device display
const DEFAULT_SIGNALING_URL = resolveDefaultSignalingUrl();
// RC4 — printed once, at module load, before any UI renders.
// eslint-disable-next-line no-console
console.log("[RC4 BUILD]", RC4_BUILD_STAMP, "| signalingUrl:", DEFAULT_SIGNALING_URL);

// Real Device Status Bar Fix — same condition as the .ft-phone/.ft-root
// "real device mode" CSS media query (narrow viewport + coarse/touch
// pointer). Used here to conditionally MOUNT (not just visually hide)
// the decorative preview-only StatusBar, so it's never in the DOM at all
// on a real phone, where the OS's own status bar already exists and
// would otherwise show duplicated underneath it.
const REAL_DEVICE_QUERY = "(max-width: 500px) and (pointer: coarse)";
function useIsRealDeviceViewport() {
  const [isRealDevice, setIsRealDevice] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(REAL_DEVICE_QUERY).matches;
  });
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(REAL_DEVICE_QUERY);
    const handler = (e) => setIsRealDevice(e.matches);
    // Safari <14 only supports the deprecated addListener/removeListener.
    if (mql.addEventListener) mql.addEventListener("change", handler);
    else mql.addListener(handler);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", handler);
      else mql.removeListener(handler);
    };
  }, []);
  return isRealDevice;
}

/**
 * CommunicationBridge — Two Device PTT Bidirectional Hardening v0.2 Part
 * G, Runtime Identity v0.4 §2. Sits between RoomProvider and
 * CommunicationProvider so it can read Room state and decide which mode
 * CommunicationProvider should run in.
 *
 * Stays in "local" mode (byte-identical to every prior Sprint) UNLESS
 * BOTH conditions hold: a Room exists AND `networkCommunicationEnabled`
 * has been explicitly switched on (RoomOverlay.jsx's DEV toggle, default
 * off). This means creating a Room for the ordinary Course/Score demo
 * flow — which needs no signaling server — never changes behavior; only
 * an explicit opt-in does.
 *
 * v0.4: identity now comes from useIdentity() (the current tab's
 * RuntimeIdentity) instead of the hardcoded ME_PLAYER_ID constant — this
 * is what lets Browser A (재식) and Browser B (재근) each connect to the
 * signaling server as themselves.
 */
function CommunicationBridge({ children }) {
  const { room } = useRoom();
  const { networkCommunicationEnabled, rejoinRequested } = useRuntimeMode();
  const identity = useIdentity();

  const useNetwork = networkCommunicationEnabled && !!room;
  const communicationMode = useNetwork ? COMMUNICATION_MODES.NETWORK : COMMUNICATION_MODES.LOCAL;
  const networkConfig = useNetwork
    ? {
        signalingUrl: DEFAULT_SIGNALING_URL,
        identity: {
          roomId: room.code,
          userId: identity.userId,
          displayName: identity.displayName,
          deviceSessionId: identity.deviceSessionId,
        },
        // RC4 Session Recovery — a [계속하기] rejoin asks the server to
        // reject an ended/expired room instead of re-creating an empty one.
        requireExisting: !!rejoinRequested,
        // RC2 review: STUN costs nothing and needs no infrastructure --
        // public servers are free and widely used for exactly this.
        // TURN is a different story (needs a real server, see the
        // STUN/TURN review in this Sprint's report) and is NOT added
        // here.
        iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
      }
    : null;
  return (
    <CommunicationProvider communicationMode={communicationMode} networkConfig={networkConfig}>
      {children}
    </CommunicationProvider>
  );
}

function AppShell() {
  const [screen, setScreen] = useState("splash");
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const { round, dispatch, actions } = useRound();
  const identity = useIdentity();
  const communication = useCommunication();
  const { room, dispatch: roomDispatch, actions: roomActions } = useRoom();
  const { networkCommunicationEnabled, setNetworkCommunicationEnabled, mode: courseRuntimeMode, rejoinRequested, setRejoinRequested } = useRuntimeMode();
  const isRealDevice = useIsRealDeviceViewport();

  const showToast = (msg) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  // RC1-WEEK3 §1 Real Invitation Flow — a real person receives this link
  // through any real channel (text, KakaoTalk, etc.) outside the app
  // entirely, taps it once, and lands in the host's actual room. No DEV
  // gate, no manual code typing. Parsed once on mount; the URL is cleaned
  // immediately after so a later reload doesn't re-trigger it.
  const [autoJoinCode, setAutoJoinCode] = useState(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("join");
    if (!code) return;
    setNetworkCommunicationEnabled(true);
    setAutoJoinCode(code.trim().toUpperCase());
    const url = new URL(window.location.href);
    url.searchParams.delete("join");
    window.history.replaceState({}, "", url.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // RC4 P0-1/P0-2/P0-3 — the demo seed round is identified by its fixed
  // id. Any round started from a real Room gets a `round_<timestamp>` id
  // (see buildInitialRoundFromRoom.js / roundActions), so "still on the
  // seed" is a precise, non-heuristic check.
  const isDemoSeedRound = round.id === "round_demo_001";

  // RC4 P0 Round Start Deadlock fix (Issue 1-A) — `startedRound` is the
  // Round object the HOST just built synchronously in
  // RoomOverlay.runStart(). When present it is the source of truth for
  // THIS transition, overriding the `round` captured in this render's
  // closure. Root cause of the deadlock: runStart() dispatches
  // roundStartFromRoom() (round.id becomes `round_<ts>`) and then calls
  // onStart() in the SAME tick, before React commits that dispatch — so
  // the `round`/`isDemoSeedRound` read here was still the stale demo
  // seed, and the host fell into the "wait for the host" guard below and
  // blocked ITSELF. Passing the freshly-built round sidesteps the stale
  // closure entirely. The guard still protects a GUEST who taps before
  // round_started has arrived (startedRound is undefined for them).
  const handleStartRound = (startedRound) => {
    const startingAsHost = !!startedRound;
    // Effective view of "are we still on the demo seed" for THIS call:
    // the host who just built a real round is, by definition, not.
    const effectiveIsDemoSeedRound = startingAsHost
      ? startedRound.id === "round_demo_001"
      : isDemoSeedRound;
    // RC4 — final-leg trace. These three lines cover the last steps that
    // were previously invisible: entering the handler, the silent
    // early-return guard, and the actual screen switch.
    // eslint-disable-next-line no-console
    console.log(
      "[HANDLE START ROUND] ENTER",
      `startingAsHost=${startingAsHost}`,
      `startedRoundId=${startedRound?.id ?? "none"}`,
      `players=${startedRound?.players?.length ?? "-"}`,
      `networkEnabled=${networkCommunicationEnabled}`,
      `effectiveIsDemoSeed=${effectiveIsDemoSeedRound}`
    );

    // RC4 P0-2/P0-3 — in network mode, entering the round must show the
    // REAL network round, never the demo seed. A GUEST who taps before
    // the host's round_started broadcast lands must wait rather than fall
    // through to the seed round (the "both devices revert to
    // 재식/재근/광천/해란" symptom). A HOST who just started never hits
    // this branch, because startedRound is a real round_<ts>.
    if (networkCommunicationEnabled && effectiveIsDemoSeedRound) {
      // eslint-disable-next-line no-console
      console.warn("[HANDLE START ROUND] BLOCKED — demo-seed guard, no screen change");
      showToast("Host가 라운드를 시작하면 자동으로 입장합니다");
      return;
    }
    // The host already dispatched roundStartFromRoom() in runStart(); only
    // the non-host / local path needs to kick a plain roundStart() here.
    if (!startingAsHost && round.status !== "active") {
      dispatch(actions.roundStart());
    }
    if (startingAsHost && networkCommunicationEnabled) {
      // RC4 diagnostics — host side. The round object is server-authoritative
      // in the sense that the host built it and broadcast the identical
      // payload; every client (host included) ends on the same roundId.
      // eslint-disable-next-line no-console
      console.log("[ROUND MODE]", "mode=network");
      // eslint-disable-next-line no-console
      console.log(
        "[ROUND STARTED]",
        `roomId=${room?.code ?? "?"}`,
        `roundId=${startedRound.id}`,
        `hostUserId=${room?.hostUserId ?? identity.userId}`,
        `memberIds=[${(startedRound.players ?? []).map((p) => p.id).join(",")}]`
      );
      // eslint-disable-next-line no-console
      console.log("[ROUND HYDRATE SOURCE]", "source=server_snapshot");
      // eslint-disable-next-line no-console
      console.log("[DEMO STATE GUARD]", "demoEffectsEnabled=false");
    }
    // eslint-disable-next-line no-console
    console.log("[HANDLE START ROUND] setScreen(round) — Hole1 진입");
    setScreen("round");
  };

  // RC4 — [ROOM STATE] observer. Prints every Room transition so a device
  // log shows whether the room was created and, if it disappears, exactly
  // when. PO DIAG reported room.code=none right after creating a room.
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log(
      "[ROOM STATE]",
      `code=${room?.code ?? "none"}`,
      `status=${room?.status ?? "none"}`,
      `members=${room?.members?.length ?? 0}`,
      `hostUserId=${room?.hostUserId ?? "none"}`,
      `networkEnabled=${networkCommunicationEnabled}`,
      `screen=${screen}`
    );
  }, [room, networkCommunicationEnabled, screen]);

  // RC4 — three DISTINCT round-screen exits, each with an explicit,
  // non-overlapping state transition. These are the single source of truth
  // shared by RoundScreen's action sheet and RoomOverlay's leave button so
  // "뒤로가기"(홈 이동) / "방 나가기" / "라운드 종료" can never collapse into
  // the same behaviour.

  // 홈으로 이동 — navigation ONLY. Room, communication, and Round state all
  // stay intact so the user can return to the live round. This is the plain
  // back arrow's meaning.
  const handleGoHome = () => {
    setScreen("home");
  };

  // 방 나가기 — full teardown of "being in a room", WITHOUT touching
  // identity/nickname (leaving a room is not a logout). Tears down the three
  // systems that each own a piece of room membership (communication / Room
  // Engine / Runtime network mode), clears recovery refs, resets the Round
  // Engine to a clean local baseline (so no stale network round lingers),
  // and returns home. On the server side, communication.leaveRoom() sends an
  // explicit room_leave which triggers immediate host transfer if this
  // device was host.
  const handleLeaveRoom = () => {
    communication.leaveRoom?.();
    roomDispatch(roomActions.roomReset());
    clearRoomState(identity.userId);
    clearActiveRoomRef();
    // RC4 — 방 나가기 후에는 LOCAL 라운드 상태로 되돌린다.
    // 이전에는 players:[] 인 빈 network baseline으로 리셋했는데, 그 상태로
    // 라운드 화면이 렌더되면 플레이어가 0명이라 "빈 화면"이 됐다
    // (Founder 확인 버그). 로컬 시드는 항상 플레이 가능한 상태이므로
    // 홈에서 바로 로컬 라운드를 시작할 수 있다.
    // RC4 — 네트워크 방 나가기 전용 정리.
    // roundReset()은 createRoundSeed()(데모 4명)를 만들기 때문에 여기서는
    // 쓰지 않는다. 네트워크 방을 나갈 때 데모 플레이어가 생성되면 안 된다
    // (Product Director decision). 활성 네트워크 라운드만 제거하고
    // 플레이어 0명의 깨끗한 상태로 둔다. Home 화면은 round 상태를 참조하지
    // 않으므로 이 상태로 홈에 머무는 데 문제가 없고, 다음 로컬 라운드는
    // 홈에서 시작할 때 새로 시드된다.
    dispatch(actions.roundLeaveNetwork(createNetworkRoundState({ players: [] })));
    setNetworkCommunicationEnabled(false);
    setScreen("home");
    showToast("방에서 나갔습니다");
  };

  // 라운드 종료 — completes the round (Room membership is KEPT, so the team
  // can start another round). Clears only the recovery ref (a completed
  // round is non-recoverable) and returns home.
  const handleEndRound = () => {
    dispatch(actions.roundComplete());
    clearActiveRoomRef();
    setScreen("home");
    showToast("라운드를 종료했습니다");
  };
  // elsewhere; a mere restart never does.
  useEffect(() => {
    if (!networkCommunicationEnabled || !room) return;
    const myMember = room.members?.find((m) => m.userId === identity.userId);
    saveActiveRoomRef({
      roomId: room.code,
      userId: identity.userId,
      displayName: identity.displayName,
      role: myMember?.role ?? (room.hostUserId === identity.userId ? "host" : "member"),
      roundId: round.id && round.id !== "round_demo_001" ? round.id : null,
      lastHole: round.currentHoleNumber ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [networkCommunicationEnabled, room?.code, room?.members, round.id, round.currentHoleNumber, identity.userId]);

  // RC4 Session Recovery — outcome of a [계속하기] rejoin. If the server
  // rejected it (room ended/expired), clear the stale activeRoomRef, tear
  // down the half-open network mode, and return Home with a simple
  // message. On success, just consume the one-shot rejoin flag; the live
  // roster/round come from the server, never from stale local data.
  useEffect(() => {
    if (!rejoinRequested) return;
    const err = communication.lastError ?? "";
    if (typeof err === "string" && err.startsWith("room_join_denied")) {
      clearActiveRoomRef();
      communication.leaveRoom?.();
      roomDispatch(roomActions.roomReset());
      setNetworkCommunicationEnabled(false);
      setRejoinRequested(false);
      setScreen("home");
      showToast("이전 라운드가 종료되었거나 만료되었습니다");
      return;
    }
    if (communication.connectionState === "connected" || communication.connectionState === "media_reconnecting") {
      setRejoinRequested(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rejoinRequested, communication.lastError, communication.connectionState]);

  // Runtime Identity v0.4 §7 — "서버 membership을 연결 상태의 source of
  // truth로 사용... member_online/member_offline을 Room actions로
  // 반영." Without this, a member who joins purely via signaling (Room
  // 코드로 참가) never appears in the local Room Engine's room.members,
  // so buildInitialRoundFromRoom (used by the HOST) would only see the
  // host even though the server correctly has both. Mirrors the
  // server-authoritative member list into local Room state via the
  // existing invite+join actions — no new Room Engine action type
  // needed.
  useEffect(() => {
    if (!networkCommunicationEnabled || !room) return;
    const serverIds = communication.members.map((m) => m.userId);
    const localIds = room.members.map((m) => m.userId);
    // RC4 P0-2 diagnostic — [ROOM MEMBERS SYNC] before/after on every
    // join/leave/reconnect, so roster drift is visible on device.
    // eslint-disable-next-line no-console
    console.log(
      "[ROOM MEMBERS SYNC] before",
      `local=[${localIds.join(",")}]`,
      `server=[${serverIds.join(",")}]`
    );

    // 1) Add / re-join anyone the SERVER says is present.
    for (const member of communication.members) {
      const existing = room.members.find((m) => m.userId === member.userId);
      if (!existing) {
        roomDispatch(roomActions.roomMemberInvite(member.userId, member.displayName));
        roomDispatch(roomActions.roomMemberJoin(member.userId));
      } else if (existing.joinStatus !== "joined") {
        // RC4 P0-2 — a RECONNECT of a known userId must REPLACE/restore the
        // existing member in place, never append a second row. roomMemberJoin
        // updates by userId, so the roster length is unchanged.
        roomDispatch(roomActions.roomMemberJoin(member.userId));
      }
    }

    // 2) RC4 P0-2 — the server roster is AUTHORITATIVE: anyone still marked
    // joined locally but absent from the server list has left/disconnected
    // and must be removed, otherwise every reconnect grows the roster
    // ("같은 이름이 계속 추가됩니다"). Self is never pruned — the local user
    // isn't in their own server member list.
    for (const local of room.members) {
      if (local.userId === identity.userId) continue;
      if (local.joinStatus !== "joined") continue;
      if (!serverIds.includes(local.userId)) {
        roomDispatch(roomActions.roomMemberLeave(local.userId));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communication.members, networkCommunicationEnabled, room?.id]);

  // RC4 Issue 4 (Host transfer) — mirror the server-authoritative host
  // into the local Room Engine whenever it changes. This is what makes
  // the round-start / hole-advance permission (server-enforced) match
  // what the UI offers, and updates the "· Host" badge. Idempotent in the
  // reducer, so a redundant echo is a no-op. Deliberately depends only on
  // communication.hostUserId (not room), so it never fights the member
  // mirror effect below.
  useEffect(() => {
    if (!networkCommunicationEnabled || !room) return;
    const serverHost = communication.hostUserId;
    if (!serverHost) return;
    if (room.hostUserId !== serverHost) {
      roomDispatch(roomActions.roomSetHost(serverHost));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communication.hostUserId, networkCommunicationEnabled, room?.hostUserId]);

  // RC4 Issue 4 — one-shot toast when host ownership transfers, so the
  // room can see who is driving now. Consumed immediately.
  useEffect(() => {
    const event = communication.hostChangedEvent;
    if (!event) return;
    const amNewHost = event.hostUserId === identity.userId;
    showToast(amNewHost ? "이제 내가 Host입니다" : "Host가 변경되었습니다");
    communication.clearHostChangedEvent?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communication.hostChangedEvent]);

  // RC1-WEEK6 §1.8 — reconnection toasts, at AppShell level (not inside
  // RoomOverlay) specifically because a real disconnect is most likely
  // to happen mid-round, and RoomOverlay isn't mounted on the Round
  // screen. This is the one place that sees every screen.
  useEffect(() => {
    const event = communication.reconnectEvent;
    if (!event) return;
    if (event === "reconnecting") showToast("연결을 다시 시도하고 있습니다.");
    else if (event === "reconnected") showToast("팀 연결이 복구되었습니다.");
    else if (event === "give_up") showToast("연결이 복구되지 않았습니다. 네트워크를 확인해 주세요.");
    communication.clearReconnectEvent?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communication.reconnectEvent]);

  // Runtime Identity v0.4 §9 — the MEMBER side of round_start signaling.
  // The host already dispatched locally in RoomOverlay.jsx's runStart();
  // this effect is what makes the OTHER browser(s) follow along, using
  // the exact same normalized payload the host broadcast (never
  // independently re-deriving their own Round, per the Sprint's warning
  // about visual/field differences between two independently-built
  // Snapshots).
  useEffect(() => {
    const payload = communication.roundStartedPayload;
    if (!payload) return;
    // I'm the host — I already started locally via RoomOverlay.jsx, and
    // the server's broadcast (Part 9's "includes the host too, for a
    // single symmetric code path") echoes back to me too. Don't rebuild.
    // Compare roundId precisely — the DEMO SEED's round.status defaults
    // to "active" with all 4 named demo players already present, so a
    // looser "status===active && I'm in it" check is always true and
    // would incorrectly skip building the received round on first entry.
    const amIAlreadyPlaying = round.id === payload.roundId;
    if (amIAlreadyPlaying) {
      communication.clearRoundStartedPayload?.();
      return;
    }

    const roomMembersLike = (payload.players ?? []).map((p) => ({
      userId: p.id,
      displayName: p.name,
      joinStatus: "joined",
      role: p.id === identity.userId ? "host_or_member" : "member",
      connectionStatus: "online",
    }));
    const result = buildInitialRoundFromRoom({
      roomMembers: roomMembersLike,
      courseSnapshot: payload.courseSnapshot,
      startHoleNumber: payload.startHole,
      // RC4 P0-1/P0-2 — this receiver path is, by definition, always a
      // network round (it only runs on a broadcast round_started). Strip
      // demo ids from the host's payload too, in case the host's own room
      // was demo-polluted, and always keep THIS device's own identity.
      networkMode: true,
      localUserId: identity.userId,
      localDisplayName: identity.displayName,
      // RC4 — adopt the server-authoritative roundId so both phones show
      // the SAME roundId (Founder Test C / diagnostic parity).
      roundId: payload.roundId,
    });
    if (result.ok) {
      // RC4 diagnostics — Founder device test observability.
      // eslint-disable-next-line no-console
      console.log("[ROUND MODE]", "mode=network");
      // eslint-disable-next-line no-console
      console.log(
        "[ROUND STARTED]",
        `roomId=${payload.roomId}`,
        `roundId=${result.round.id}`,
        `hostUserId=${communication.hostUserId ?? room?.hostUserId ?? "?"}`,
        `memberIds=[${result.round.players.map((p) => p.id).join(",")}]`
      );
      // eslint-disable-next-line no-console
      console.log("[ROUND HYDRATE SOURCE]", "source=server_snapshot");
      // eslint-disable-next-line no-console
      console.log("[DEMO STATE GUARD]", "demoEffectsEnabled=false");
      dispatch(actions.roundStartFromRoom(result.round));
      setScreen("round");
      showToast("Host가 라운드를 시작했습니다");
    } else {
      // RC4 diagnostic — the receiver got round_started but couldn't build
      // a round. This is a real stall cause (guest clears payload and never
      // navigates), so surface exactly why.
      // eslint-disable-next-line no-console
      console.error("[GUEST] round_started build FAILED", `reason=${result.reason}`, `hasCourse=${!!payload.courseSnapshot}`, `players=${(payload.players ?? []).length}`);
    }
    communication.clearRoundStartedPayload?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communication.roundStartedPayload]);

  // RC1 Networking Recovery — the receiving side of distance sharing.
  // The sender already applied their own share locally (DistanceCard.jsx
  // dispatches directly); this is what makes a TEAMMATE's share actually
  // show up on MY screen, which never happened before this Sprint.
  useEffect(() => {
    const payload = communication.receivedDistanceShare;
    if (!payload) return;
    dispatch(
      actions.teamDistanceShare({
        referencePlayerId: payload.referencePlayerId,
        referenceDistanceM: payload.referenceDistanceM,
        source: payload.source,
        runtimeMode: courseRuntimeMode,
      })
    );
    communication.clearReceivedDistanceShare?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communication.receivedDistanceShare]);

  // P0-5 fix — the receiving side of cheer/sound sharing, same pattern
  // as distance sharing above. The sender already applied it locally
  // (GalleryPanel.jsx dispatches directly); this makes a TEAMMATE's
  // cheer actually show up on MY screen (Event Board bubble via the
  // existing SOUND_PLAYED reducer case), which never happened before.
  useEffect(() => {
    const payload = communication.receivedSoundPlayed;
    if (!payload) return;
    // (1) Event Board — unchanged: adds the "👏 {label}" bubble.
    dispatch(
      actions.soundPlayed({
        soundId: payload.soundId,
        category: payload.category,
        label: payload.label,
        actorPlayerId: payload.actorUserId,
      })
    );
    // (2) RC4 P1-1 — actually PLAY the cheer on this (remote) device. This
    // was the missing half: before, a teammate's cheer only ever drew a
    // silent bubble here. The sender is NOT at risk of double playback —
    // the signaling server broadcasts sound_played with the sender
    // EXCLUDED, and NetworkPttClient additionally de-dupes by eventId — so
    // this effect only ever runs on devices OTHER than the one that tapped
    // the cheer. Reuses playSoundById (the same engine the sender used).
    if (payload.soundId) {
      playSoundById(payload.soundId).catch(() => {
        // A remote playback failure (e.g. autoplay policy before any user
        // gesture on this device) must never break the Event Board update
        // above — swallow it the same way local playback failures surface
        // only as a toast, not a crash.
      });
    }
    communication.clearReceivedSoundPlayed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communication.receivedSoundPlayed]);

  return (
    <div className="ft-root">
      <div className="ft-phone">
        {!isRealDevice && <StatusBar />}
        {screen === "splash" && <SplashScreen onDone={() => setScreen("home")} />}
        {screen === "home" && (
          <HomeScreen
            onStartRound={handleStartRound}
            onToast={showToast}
            onOpenTwoDeviceTest={() => setScreen("twoDeviceTest")}
            onOpenIdentitySelect={() => setScreen("identitySelect")}
            autoJoinCode={autoJoinCode}
            onAutoJoinConsumed={() => setAutoJoinCode(null)}
          />
        )}
        {screen === "round" && (
          <RoundScreen
            onBack={handleGoHome}
            onGoHome={handleGoHome}
            onLeaveRoom={handleLeaveRoom}
            onEndRound={handleEndRound}
            onToast={showToast}
          />
        )}
        {screen === "twoDeviceTest" && (
          <TwoDeviceTestScreen onBack={() => setScreen("home")} onToast={showToast} />
        )}
        {screen === "identitySelect" && <IdentitySelectScreen onBack={() => setScreen("home")} />}
        {screen !== "splash" && <div className="ft-home-indicator" />}
        {toast && <div className="ft-global-toast">{toast}</div>}
        {communication.lastError === "remote_audio_playback_blocked" && (
          <button
            type="button"
            className="ft-audio-unblock-banner"
            onClick={() => communication.retryRemoteAudioPlayback?.()}
          >
            상대방 음성이 재생되지 않고 있습니다. 탭하여 다시 시도하세요.
          </button>
        )}
        {/* RC4 P0 — the PO panel must be reachable in EVERY state being
            investigated. It was previously gated behind
            (isDevModeTopLevel || networkCommunicationEnabled), so on a
            production build with network off — exactly the state under
            investigation — the PO button did not exist. Ungated while the
            P0 investigation is open. */}
        <P0DebugOverlay
          p0Lifecycle={communication.p0Lifecycle}
          p0LevelDebug={communication.p0LevelDebug}
          remoteAudioContextState={communication.remoteAudioContextState}
          remoteTrackAttached={communication.remoteTrackAttached}
          lastAudioPlaybackAttempt={communication.lastAudioPlaybackAttempt}
          buildStamp={RC4_BUILD_STAMP}
          screen={screen}
          roomCode={room?.code ?? null}
          roomStatus={room?.status ?? null}
          roomMemberCount={room?.members?.length ?? null}
          roomHostUserId={room?.hostUserId ?? null}
          networkEnabled={networkCommunicationEnabled}
          roundId={round?.id ?? null}
          roundStatus={round?.status ?? null}
          roundPlayerCount={round?.players?.length ?? null}
          isNetworkBaseline={round?.isNetworkBaseline === true}
        />
      </div>
    </div>
  );
}

// RC2 real-device fix — sits inside IdentityProvider (needs useIdentity())
// and decides, once, whether this device needs a name before anything
// else runs. Everyone else (the host, anyone who already has a stored
// identity, anyone not arriving via a join link) sees no change at all.
function AppGate() {
  const identity = useIdentity();
  const [pendingJoinCode] = useState(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("join");
  });

  const needsName = !!pendingJoinCode && identity.userId === DEFAULT_IDENTITY_USER_ID;

  if (needsName) {
    return (
      <div className="ft-root">
        <div className="ft-phone">
          <NameEntryScreen
            roomCode={pendingJoinCode}
            onSubmit={(displayName) => {
              // RC2 mic permission timing fix — same reasoning as
              // handleTeamConnect in HomeScreen.jsx: tie the permission
              // request to this exact tap. A grant persists per-origin
              // across the reload setIdentity() triggers, so the
              // rejoined page won't need to prompt again later.
              if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
                navigator.mediaDevices
                  .getUserMedia({ audio: true })
                  .then((stream) => stream.getTracks().forEach((t) => t.stop()))
                  .catch(() => {});
              }
              const uniqueUserId = `player_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
              identity.setIdentity(uniqueUserId, displayName); // saves + reloads; ?join= stays in the URL through the reload
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <RuntimeModeProvider>
      <RoomProvider>
        <CommunicationBridge>
          <RoundProvider>
            <AppShell />
          </RoundProvider>
        </CommunicationBridge>
      </RoomProvider>
    </RuntimeModeProvider>
  );
}

export default function App() {
  return (
    <IdentityProvider>
      <AppGate />
    </IdentityProvider>
  );
}
