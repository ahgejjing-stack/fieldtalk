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
import { useCommunication } from "./context/useCommunication.js";
import { buildInitialRoundFromRoom } from "./room/buildInitialRoundFromRoom.js";

const DEFAULT_SIGNALING_URL =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_SIGNALING_URL) ||
  "ws://localhost:8787";

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
        iceServers: [], // §2 note carried over from v0.1: empty works for same-machine/same-network, real deployment injects STUN/TURN via config
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
  const { networkCommunicationEnabled, setNetworkCommunicationEnabled } = useRuntimeMode();

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

  return (
    <div className="ft-root">
      <div className="ft-phone">
        <StatusBar />
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

export default function App() {
  return (
    <IdentityProvider>
      <RuntimeModeProvider>
        <RoomProvider>
          <CommunicationBridge>
            <RoundProvider>
              <AppShell />
            </RoundProvider>
          </CommunicationBridge>
        </RoomProvider>
      </RuntimeModeProvider>
    </IdentityProvider>
  );
}
