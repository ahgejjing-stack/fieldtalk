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
import { useCommunication } from "./context/useCommunication.js";
import { buildInitialRoundFromRoom } from "./room/buildInitialRoundFromRoom.js";

function resolveDefaultSignalingUrl() {
  const isHttpsPage = typeof window !== "undefined" && window.location && window.location.protocol === "https:";

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
const DEFAULT_SIGNALING_URL = resolveDefaultSignalingUrl();

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
  const { networkCommunicationEnabled } = useRuntimeMode();
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
  const { networkCommunicationEnabled, setNetworkCommunicationEnabled, mode: courseRuntimeMode } = useRuntimeMode();
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

  const handleStartRound = () => {
    if (round.status !== "active") {
      dispatch(actions.roundStart());
    }
    setScreen("round");
  };

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
    for (const member of communication.members) {
      const existing = room.members.find((m) => m.userId === member.userId);
      if (!existing) {
        roomDispatch(roomActions.roomMemberInvite(member.userId, member.displayName));
        roomDispatch(roomActions.roomMemberJoin(member.userId));
      } else if (existing.joinStatus !== "joined") {
        roomDispatch(roomActions.roomMemberJoin(member.userId));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communication.members, networkCommunicationEnabled, room?.id]);

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
    });
    if (result.ok) {
      dispatch(actions.roundStartFromRoom(result.round));
      setScreen("round");
      showToast("Host가 라운드를 시작했습니다");
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
          <RoundScreen onBack={() => setScreen("home")} onToast={showToast} />
        )}
        {screen === "twoDeviceTest" && (
          <TwoDeviceTestScreen onBack={() => setScreen("home")} onToast={showToast} />
        )}
        {screen === "identitySelect" && <IdentitySelectScreen onBack={() => setScreen("home")} />}
        {screen !== "splash" && <div className="ft-home-indicator" />}
        {toast && <div className="ft-global-toast">{toast}</div>}
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
