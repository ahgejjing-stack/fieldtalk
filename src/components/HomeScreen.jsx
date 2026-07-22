import React, { useEffect, useState } from "react";
import { Check, Radio, Settings, User, Users } from "lucide-react";
import GolfBall from "./GolfBall.jsx";
import RoomOverlay from "./RoomOverlay.jsx";
import { useRoom } from "../context/useRoom.js";
import { useIdentity } from "../context/useIdentity.js";
import { useRuntimeMode } from "../context/RuntimeModeContext.jsx";

// Two Device PTT Foundation v0.1 — DEV-only entry point, same convention
// as RoomOverlay.jsx's debug display.
const isDevMode = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;

function HomeGlyph({ active }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 11.5L12 4l8 7.5V20a1 1 0 01-1 1h-4.5v-6h-5v6H5a1 1 0 01-1-1v-8.5z"
        fill={active ? "#2FBE7F" : "none"}
        stroke={active ? "#2FBE7F" : "#8B978F"}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function HomeScreen({
  onStartRound,
  onToast,
  onOpenTwoDeviceTest,
  onOpenIdentitySelect,
  autoJoinCode,
  onAutoJoinConsumed,
}) {
  const { room, dispatch, actions } = useRoom();
  const identity = useIdentity();
  const { setNetworkCommunicationEnabled } = useRuntimeMode();
  const [roomOverlayOpen, setRoomOverlayOpen] = useState(false);

  // RC1-WEEK3 §1 — a real invite link landed here. Join immediately and
  // open the same Room Overlay the manual "팀 연결" flow uses — no
  // separate screen, no new UI to learn beyond "I tapped a link and I'm
  // in the room."
  useEffect(() => {
    if (!autoJoinCode) return;
    dispatch(actions.roomJoinByCode(autoJoinCode, identity.userId, identity.displayName));
    setRoomOverlayOpen(true);
    onToast(`Room ${autoJoinCode}에 참가했습니다`);
    onAutoJoinConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoJoinCode]);

  // Round Room Foundation v0.1 §4: "현재처럼 HomeScreen의 독립 useState로
  // 남기지 마세요" — this now reads directly off Room state instead of a
  // local `invited` useState. Colors kept here since Room doesn't own
  // display styling.
  const companions = [
    { id: "player_jaegeun", name: "재근", color: "#4FA8FF" },
    { id: "player_gwangcheon", name: "광천", color: "#C9A24B" },
    { id: "player_haeran", name: "해란", color: "#E37FBD" },
  ];

  const handleTeamConnect = () => {
    if (!room) {
      dispatch(actions.roomCreate(identity.userId, identity.displayName));
    }
    // RC2 mic permission timing fix: request mic permission synchronously,
    // tied directly to this tap. iOS/WebKit can lose "user activation"
    // context by the time an async network round-trip (room_joined)
    // resolves, which is when the existing prepare-mic-in-parallel logic
    // fires — the permission dialog can then appear disconnected from
    // any visible action, "suddenly", much later. Asking here instead
    // means it's always tied to the tap the person just made. Once
    // granted, the later flow just reuses it — no second prompt.
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => stream.getTracks().forEach((t) => t.stop()))
        .catch(() => {}); // denial/failure surfaces normally later via the real prepare() flow
    }
    setNetworkCommunicationEnabled(true);
    setRoomOverlayOpen(true);
  };

  // RC1-WEEK3 §1 — the real replacement for "호스트가 동반자 상태를 대신
  // 탭하는" simulation: a link a real person can receive through any real
  // channel outside the app (문자, 카톡 등) and tap once to join. Uses the
  // Clipboard API, which is real in an actual deployed browser/PWA — not
  // a DEV-only mechanism.
  const handleCopyInviteLink = async () => {
    if (!room) return;
    setNetworkCommunicationEnabled(true);
    const url = new URL(window.location.href);
    url.search = ""; // never carry over any stray query params
    url.searchParams.set("join", room.code);
    const link = url.toString();

    // RC2 Join Flow priority — native share sheet first: on a real phone
    // this opens Messages/KakaoTalk/etc. directly, which is far more
    // likely to actually reach the other person than "copied, now go
    // paste it somewhere yourself".
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "FIELDTALK 초대", text: "같이 라운드 하실래요? 아래 링크로 참가해주세요.", url: link });
        return; // share sheet itself is the confirmation -- no extra toast needed
      } catch (err) {
        if (err?.name === "AbortError") return; // user closed the share sheet -- not a failure, don't fall through to a toast
        // any other failure (unsupported context, etc.) falls through to clipboard below
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      onToast("초대 링크를 복사했습니다");
    } catch (err) {
      onToast(`초대 링크: ${link}`);
    }
  };

  // Runtime Identity v0.4 §6 — Member join flow, DEV/Prototype-only (no
  // invite link/QR this Sprint, "Room code 직접 입력은 DEV/Prototype용으로
  // 허용"). window.prompt is intentionally minimal for a DEV-gated action.
  const handleJoinByCode = () => {
    const code = window.prompt("참가할 Room 코드를 입력하세요 (Host 화면에 표시된 코드)");
    if (!code || !code.trim()) return;
    dispatch(actions.roomJoinByCode(code.trim().toUpperCase(), identity.userId, identity.displayName));
    setNetworkCommunicationEnabled(true);
    setRoomOverlayOpen(true);
  };

  const toggleInvite = (companion) => {
    if (!room) {
      // 홈 화면의 동반자 섹션은 항상 보이는 UI라, "팀 연결"을 먼저 누르지
      // 않아도 즉시 동작해야 한다 — Room을 이 시점에 lazily 생성한다.
      dispatch(actions.roomCreate(identity.userId, identity.displayName));
      dispatch(actions.roomMemberInvite(companion.id, companion.name));
      setNetworkCommunicationEnabled(true);
      return;
    }
    const member = room.members.find((m) => m.userId === companion.id);
    if (!member || member.joinStatus === "declined" || member.joinStatus === "left") {
      dispatch(actions.roomMemberInvite(companion.id, companion.name));
    } else if (member.joinStatus === "invited") {
      dispatch(actions.roomMemberJoin(companion.id)); // DEV: 초대→참여 시뮬레이션
    } else if (member.joinStatus === "joined") {
      dispatch(actions.roomMemberLeave(companion.id));
    }
  };

  const recentRounds = [
    { date: "10월 6일", course: "레이크사이드 CC", score: 78, toPar: "+6" },
    { date: "9월 29일", course: "파인밸리 GC", score: 82, toPar: "+10" },
  ];

  return (
    <div className="ft-screen ft-home">
      <div className="ft-home-header">
        <div className="ft-home-brand">
          <GolfBall size={22} />
          <span>FIELDTALK</span>
        </div>
        <button className="ft-icon-btn" onClick={() => onToast("프로필 설정은 준비 중입니다")}>
          <Settings size={18} strokeWidth={2} />
        </button>
      </div>

      <div className="ft-home-scroll">
        <div className="ft-greeting">
          <h1>안녕하세요, {identity.displayName}님</h1>
          <p>오늘 라운드를 시작해볼까요?</p>
        </div>

        <div className="ft-cta-card">
          <div className="ft-cta-ring" />
          <div className="ft-cta-top">
            <span className="ft-eyebrow">다음 라운드</span>
            <span className="ft-cta-time">07:12 AM</span>
          </div>
          <div className="ft-cta-course">레이크사이드 컨트리클럽</div>
          <div className="ft-cta-sub">후반 코스 · 1번 홀 티오프</div>
          <button className="ft-primary-btn" onClick={onStartRound}>
            <Radio size={18} strokeWidth={2.2} />
            라운드 시작
          </button>
          <button className="ft-team-connect-btn" onClick={handleTeamConnect}>
            팀 연결{room ? ` · Room ${room.code}` : ""}
          </button>
          {room && (
            <button className="ft-team-connect-btn" onClick={handleCopyInviteLink}>
              초대 링크 복사
            </button>
          )}
          {isDevMode && (
            <button className="ft-two-device-dev-entry" onClick={handleJoinByCode}>
              Room 코드로 참가 (DEV)
            </button>
          )}
          {isDevMode && (
            <button className="ft-two-device-dev-entry" onClick={onOpenTwoDeviceTest}>
              2-Device PTT 테스트 (DEV)
            </button>
          )}
          {isDevMode && (
            <button className="ft-two-device-dev-entry" onClick={onOpenIdentitySelect}>
              Identity: {identity.displayName} 변경 (DEV)
            </button>
          )}
        </div>

        {isDevMode && (
          <div className="ft-section">
            <div className="ft-section-head">
              <span className="ft-section-title">동반자 (DEV 시뮬레이션)</span>
              <span className="ft-section-meta">
                <Users size={13} /> {companions.length}명 초대 가능
              </span>
            </div>
            <p className="ft-pin-position-hint" style={{ margin: "-4px 0 8px" }}>
              <strong>Preview Simulation</strong>
              <br />
              탭하여 참여 상태를 시뮬레이션합니다.
              <br />
              실제 초대 알림은 아직 구현되지 않았습니다.
            </p>
            <div className="ft-companions">
              {companions.map((c) => {
                const member = room?.members.find((m) => m.userId === c.id);
                const isJoined = member?.joinStatus === "joined";
                const isInvited = member?.joinStatus === "invited";
                const label = isJoined
                  ? "참여함"
                  : isInvited
                  ? "초대됨"
                  : "미초대";
                return (
                  <button
                    key={c.id}
                    className={`ft-companion ${isJoined || isInvited ? "is-invited" : ""}`}
                    onClick={() => toggleInvite(c)}
                  >
                    <div className="ft-avatar" style={{ "--avatar-color": c.color }}>
                      {c.name}
                      <span className={`ft-dot ${isJoined ? "is-online" : ""}`} />
                      {isJoined && (
                        <span className="ft-invited-badge">
                          <Check size={11} strokeWidth={3} />
                        </span>
                    )}
                  </div>
                  <span className="ft-companion-label">{label}</span>
                </button>
              );
            })}
          </div>
          </div>
        )}

        {room && room.members.filter((m) => m.userId !== identity.userId).length > 0 && (
          <div className="ft-section">
            <div className="ft-section-head">
              <span className="ft-section-title">참가자</span>
              <span className="ft-section-meta">
                <Users size={13} /> {room.members.filter((m) => m.userId !== identity.userId).length}명
              </span>
            </div>
            <div className="ft-companions">
              {room.members
                .filter((m) => m.userId !== identity.userId)
                .map((m) => (
                  <div className="ft-avatar" key={m.userId} style={{ "--avatar-color": "#5ddba0" }}>
                    {m.displayName}
                    <span className={`ft-dot ${m.joinStatus === "joined" ? "is-online" : ""}`} />
                  </div>
                ))}
            </div>
          </div>
        )}

        <div className="ft-section">
          <div className="ft-section-head">
            <span className="ft-section-title">최근 라운드</span>
          </div>
          <div className="ft-recent-list">
            {recentRounds.map((r, i) => (
              <div
                className="ft-recent-row"
                key={i}
                onClick={() => onToast("최근 라운드 상세 기능은 준비 중입니다.")}
              >
                <div className="ft-recent-left">
                  <div className="ft-recent-course">{r.course}</div>
                  <div className="ft-recent-date">{r.date}</div>
                </div>
                <div className="ft-recent-score">
                  <span className="ft-recent-score-num">{r.score}</span>
                  <span className="ft-recent-score-par">{r.toPar}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="ft-bottom-spacer" />
      </div>

      <div className="ft-tabbar">
        <div className="ft-tab is-active">
          <div className="ft-tab-icon">
            <HomeGlyph active />
          </div>
          <span>홈</span>
        </div>
        <button className="ft-tab" onClick={onStartRound}>
          <div className="ft-tab-icon">
            <Radio size={18} strokeWidth={2} />
          </div>
          <span>라운드</span>
        </button>
        <button className="ft-tab" onClick={() => onToast("준비 중인 기능입니다")}>
          <div className="ft-tab-icon">
            <Users size={18} strokeWidth={2} />
          </div>
          <span>동반자</span>
        </button>
        <button className="ft-tab" onClick={() => onToast("준비 중인 기능입니다")}>
          <div className="ft-tab-icon">
            <User size={18} strokeWidth={2} />
          </div>
          <span>프로필</span>
        </button>
      </div>

      <RoomOverlay
        isOpen={roomOverlayOpen}
        onClose={() => setRoomOverlayOpen(false)}
        onToast={onToast}
        onStart={() => {
          setRoomOverlayOpen(false);
          onStartRound();
        }}
      />
    </div>
  );
}
