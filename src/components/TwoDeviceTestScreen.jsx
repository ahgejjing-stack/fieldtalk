import React, { useEffect, useRef, useState } from "react";
import { X, Mic, ChevronLeft } from "lucide-react";
import { CommunicationProvider } from "../context/CommunicationProvider.jsx";
import { useCommunication } from "../context/useCommunication.js";
import { COMMUNICATION_MODES } from "../config/communicationMode.js";
import { PttPressController } from "../communication/PttPressController.js";

/**
 * TwoDeviceTestScreen — Two Device PTT Foundation v0.1.
 *
 * Deliberately isolated from the main Room/Round flow (§ design note in
 * the Sprint 결과 보고): the app's existing `ME_PLAYER_ID` identity model
 * is a much deeper piece of the Round Engine to safely rewire for
 * per-tab identity selection, and this Sprint's stated goal is narrower
 * — "동일 Room에 접속한 두 브라우저 사이에서... 최소 경로를 만든다", not
 * full Round integration. This screen proves the Communication Adapter
 * boundary (§4) directly: it renders its OWN <CommunicationProvider
 * communicationMode="network">, and uses the exact same
 * useCommunication()/PttPressController pattern PTTButton.jsx uses for
 * the local path — nothing here touches WebSocket/WebRTC directly either.
 *
 * DEV-only entry point (see HomeScreen.jsx's "2-Device PTT 테스트" button).
 */

const IDENTITIES = {
  player_jaesik: { userId: "player_jaesik", displayName: "재식" },
  player_jaegeun: { userId: "player_jaegeun", displayName: "재근" },
};

const DEFAULT_SIGNALING_URL =
  typeof window !== "undefined" && window.location && window.location.hostname
    ? `ws://${window.location.hostname}:8787`
    : "ws://localhost:8787";

function IdentityPicker({ selected, onSelect }) {
  return (
    <div className="ft-pin-position-pills">
      {Object.values(IDENTITIES).map((id) => (
        <button
          key={id.userId}
          className={`ft-pin-pill ${selected === id.userId ? "is-active" : ""}`}
          onClick={() => onSelect(id.userId)}
        >
          {id.displayName}
        </button>
      ))}
    </div>
  );
}

/** The actual test UI, rendered INSIDE a network-mode CommunicationProvider
 * once an identity + signaling URL have been chosen. */
function TwoDeviceTestInner({ myUserId, onToast, onLeave }) {
  const communication = useCommunication();
  const [joined, setJoined] = useState(false);
  const [deniedReason, setDeniedReason] = useState(null);
  const controllerRef = useRef(null);
  if (!controllerRef.current) controllerRef.current = new PttPressController();
  const pressedRef = useRef(false);

  const otherUserId = Object.keys(IDENTITIES).find((id) => id !== myUserId);
  const otherDisplayName = IDENTITIES[otherUserId].displayName;

  useEffect(() => {
    controllerRef.current.setMounted(true);
    return () => {
      controllerRef.current.setMounted(false);
      controllerRef.current.endPress();
      if (pressedRef.current) {
        pressedRef.current = false;
        communication.stopTransmit();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Background-safety mirror of PTTButton.jsx's Hotfix-v0.2 pattern: if
  // Communication stops transmitting for a reason other than our own
  // handleEnd (denied/expired/connection lost), release the press
  // controller's pointerHeld too so the next press isn't silently blocked.
  useEffect(() => {
    if (!communication.isTransmitting && pressedRef.current) {
      pressedRef.current = false;
      controllerRef.current.endPress();
    }
  }, [communication.isTransmitting]);

  const handleJoin = async () => {
    const result = await communication.connectToRoom();
    if (result.ok) {
      setJoined(true);
      onToast("Room에 참가했습니다");
    } else {
      onToast(`Room 참가 실패 (${result.reason})`);
    }
  };

  const attemptTransmit = async (generation) => {
    const controller = controllerRef.current;
    setDeniedReason(null);
    const result = await communication.startTransmit([otherUserId]);
    if (!controller.isStillValid(generation)) {
      if (result.ok) communication.stopTransmit();
      return;
    }
    if (!result.ok) {
      setDeniedReason(result.reason);
      return;
    }
    pressedRef.current = true;
  };

  const handleStart = (e) => {
    e.preventDefault();
    const controller = controllerRef.current;
    if (controller.pointerHeld) return;
    if (!joined) {
      onToast("먼저 Room에 참가하세요");
      return;
    }
    const generation = controller.beginPress();
    controller.runExclusive(generation, attemptTransmit);
  };

  const handleEnd = () => {
    controllerRef.current.endPress();
    if (!pressedRef.current) return;
    pressedRef.current = false;
    communication.stopTransmit();
  };

  const iAmReceiving = communication.isReceiving;
  const remoteSpeakerName = communication.remoteSpeakerName;

  return (
    <div className="ft-two-device-inner">
      <div className="ft-room-ready-summary">
        <span>나: {IDENTITIES[myUserId].displayName}</span>
        <span>대상: {otherDisplayName}</span>
        <span>연결 상태: {communication.connectionState}</span>
        <span>Room 멤버: {communication.members.map((m) => m.displayName).join(", ") || "없음"}</span>
      </div>

      {!joined && (
        <button type="button" className="ft-hole-complete-btn" onClick={handleJoin}>
          Room 참가
        </button>
      )}

      {joined && (
        <>
          {iAmReceiving && (
            <div className="ft-two-device-receiving">
              <Mic size={14} strokeWidth={2.2} />
              {remoteSpeakerName}님 음성 수신 중
              <span className="ft-two-device-level">level={communication.remoteInputLevel.toFixed(2)}</span>
            </div>
          )}

          {deniedReason && <p className="ft-room-warning-confirm">거부됨: {deniedReason}</p>}

          <div className="ft-ptt-zone">
            <div className={`ft-ptt-wrap ${communication.isTransmitting ? "is-on" : ""}`}>
              <button
                type="button"
                className="ft-ptt-btn"
                onPointerDown={handleStart}
                onPointerUp={handleEnd}
                onPointerLeave={handleEnd}
                onPointerCancel={handleEnd}
                onContextMenu={(e) => e.preventDefault()}
              >
                <Mic size={30} strokeWidth={1.8} />
              </button>
            </div>
            <p className="ft-pin-position-hint">
              {communication.isTransmitting
                ? `${otherDisplayName}에게 송신 중 (level=${communication.inputLevel.toFixed(2)})`
                : `길게 눌러 ${otherDisplayName}에게 말하기`}
            </p>
          </div>
        </>
      )}

      <button type="button" className="ft-preround-course-row" onClick={onLeave} style={{ marginTop: 12 }}>
        <span className="ft-preround-course-name">나가기</span>
      </button>
    </div>
  );
}

export default function TwoDeviceTestScreen({ onBack, onToast }) {
  const [myUserId, setMyUserId] = useState("player_jaesik");
  const [active, setActive] = useState(false); // becomes true once CommunicationProvider is mounted for this identity
  const [signalingUrl] = useState(DEFAULT_SIGNALING_URL);
  // Editable so this isolated screen can join the SAME room the main
  // Room→Round flow created (App.jsx's CommunicationBridge uses
  // Room.code as the network roomId) — needed to test bidirectional
  // audio between "Browser A on the main flow" and "Browser B on this
  // screen" against the same signaling room.
  const [roomId, setRoomId] = useState("two_device_test_room");

  const networkConfig = {
    signalingUrl,
    identity: { ...IDENTITIES[myUserId], roomId, deviceSessionId: `${myUserId}_${Date.now()}` },
    iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }], // RC2 review: free public STUN, no infra needed
  };

  return (
    <div className="ft-screen ft-home">
      <div className="ft-home-header">
        <button className="ft-icon-btn" onClick={onBack} aria-label="뒤로">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <div className="ft-home-brand">
          <span>2-Device PTT 테스트 (DEV)</span>
        </div>
        <button className="ft-icon-btn" onClick={onBack} aria-label="닫기">
          <X size={16} strokeWidth={2.2} />
        </button>
      </div>

      <div className="ft-home-scroll">
        <div className="ft-cta-card">
          <span className="ft-eyebrow">신원 선택 (탭마다 다르게)</span>
          <IdentityPicker
            selected={myUserId}
            onSelect={(id) => {
              setMyUserId(id);
              setActive(false); // force a fresh CommunicationProvider/client for the new identity
            }}
          />
          <p className="ft-pin-position-hint">Signaling: {signalingUrl}</p>
          <p className="ft-pin-position-hint">
            Room ID:{" "}
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              disabled={active}
              style={{
                background: "transparent",
                border: "1px solid var(--border-soft)",
                borderRadius: 6,
                color: "var(--ink-0)",
                padding: "2px 6px",
                fontSize: 11,
                width: 140,
              }}
            />
          </p>
          {!active && (
            <button type="button" className="ft-primary-btn" onClick={() => setActive(true)}>
              이 신원으로 시작
            </button>
          )}
        </div>

        {active && (
          <CommunicationProvider
            key={myUserId}
            communicationMode={COMMUNICATION_MODES.NETWORK}
            networkConfig={networkConfig}
          >
            <TwoDeviceTestInner myUserId={myUserId} onToast={onToast} onLeave={() => setActive(false)} />
          </CommunicationProvider>
        )}
      </div>
    </div>
  );
}
