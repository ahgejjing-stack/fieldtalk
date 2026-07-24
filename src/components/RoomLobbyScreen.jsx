import React from "react";
import { Check, Users } from "lucide-react";
import { useRoom } from "../context/useRoom.js";
import { useRound } from "../context/useRound.js";
import { useIdentity } from "../context/useIdentity.js";
import { useCommunication } from "../context/useCommunication.js";
import { useRuntimeMode } from "../context/RuntimeModeContext.jsx";
import { useStartRoundFromRoom } from "../room/useStartRoundFromRoom.js";

/**
 * RoomLobbyScreen.jsx — RC4 Room (대기실 / Lobby).
 * ------------------------------------------------------------------
 * Architecture Decision: Round Preparation 화면은 Flow에서 제거되었다.
 * 코스/시작 홀/마이크 설정은 CreateRoomScreen이 이미 수행하므로,
 * Room은 "방이 만들어졌다"를 보여주는 대기실 역할만 한다.
 *
 *   Home -> 방 만들기(CreateRoom) -> Room(여기) -> ROUND START -> Hole1
 *
 * 이 화면에 있는 것:
 *   방 제목 / Room Code / Host / 참가자 목록 / 참가자 상태 / 초대 / ROUND START
 *
 * 이 화면에 없는 것 (CreateRoomScreen 소관):
 *   코스 선택 / 시작 홀 선택 / 마이크 설정 / 데모 시뮬레이션
 *
 * 앞으로 Lobby로 확장될 자리이기도 하다 — 참가자 승인, 비밀번호 입장,
 * 음성 준비 상태 등이 여기에 붙는다.
 * ------------------------------------------------------------------
 */
export default function RoomLobbyScreen({ isOpen, onClose, onToast, onStart, roundSetup }) {
  const { room } = useRoom();
  const { meId } = useRound();
  const identity = useIdentity();
  const communication = useCommunication();
  const { networkCommunicationEnabled } = useRuntimeMode();
  const { startRoundFromRoom } = useStartRoundFromRoom();

  if (!isOpen || !room) return null;

  // 연결된 참가자만 표시한다. 끊긴 사용자는 목록에 남기지 않는다.
  // 자신은 항상 포함(로컬 기기는 정의상 연결됨) — Host 혼자면 1명.
  const connected = room.members.filter(
    (m) => m.userId === identity.userId || (m.joinStatus === "joined" && m.connectionStatus === "online")
  );

  async function handleInvite() {
    try {
      const url = new URL(window.location.href);
      url.search = "";
      url.searchParams.set("room", room.code);
      const link = url.toString();
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        onToast?.("초대 링크를 복사했습니다");
      } else {
        onToast?.(`초대 링크: ${link}`);
      }
    } catch {
      onToast?.(`Room 코드: ${room.code}`);
    }
  }

  function handleRoundStart() {
    // CreateRoomScreen에서 정한 코스/시작 홀을 그대로 사용한다.
    // 여기서 다시 고르게 하지 않는 것이 이 화면의 핵심이다.
    const course = roundSetup?.course ?? null;
    const startHole = roundSetup?.startHole ?? 1;
    // eslint-disable-next-line no-console
    console.log("[ROOM LOBBY] ROUND START", `course=${course?.id ?? "none"}`, `startHole=${startHole}`, `members=${connected.length}`);

    const result = startRoundFromRoom(course, startHole);
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.error("[ROOM LOBBY] round build FAILED", `reason=${result.reason}`);
      onToast?.("라운드를 시작할 수 없습니다. 다시 시도해주세요.");
      return;
    }

    if (networkCommunicationEnabled && communication.sendRoundStart) {
      communication.sendRoundStart({
        roundId: result.round.id,
        courseSnapshot: course,
        startHole,
        startedAt: result.round.startedAt,
        players: result.round.players.map((p) => ({ id: p.id, name: p.name })),
      });
    }

    onClose();
    onStart(result.round);
  }

  const isHost = room.hostUserId === (meId ?? identity.userId);

  return (
    <div style={S.overlay}>
      {/* 배경 터치로 닫히지 않는다. 닫기는 명시적 버튼만. */}
      <div style={S.scrim} />
      <div style={S.sheet}>
        <div style={S.header}>
          <div style={S.title}>{room.title ?? "라운드"}</div>
          <button type="button" style={S.closeBtn} onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <div style={S.scroll}>
          {/* Room Code */}
          <div style={S.codeCard}>
            <span style={S.codeLabel}>Room Code</span>
            <span style={S.codeValue}>{room.code}</span>
          </div>

          {/* 참가자 */}
          <div style={S.sectionHead}>
            <span style={S.sectionTitle}>
              <Users size={14} strokeWidth={2.2} /> 참가자 {connected.length}명
            </span>
          </div>
          <div style={S.memberList}>
            {connected.map((m) => {
              const isSelf = m.userId === identity.userId;
              const memberIsHost = m.userId === room.hostUserId;
              return (
                <div key={m.userId} style={S.memberRow}>
                  <span style={S.memberName}>
                    {isSelf ? "나" : m.displayName}
                    {memberIsHost && <span style={S.hostBadge}>Host</span>}
                  </span>
                  <span style={S.memberStatus}>
                    <Check size={12} strokeWidth={3} /> 연결됨
                  </span>
                </div>
              );
            })}
          </div>
          {connected.length === 1 && (
            <p style={S.hint}>동반자를 초대하면 여기에 표시됩니다.</p>
          )}

          <button style={S.inviteBtn} onClick={handleInvite}>
            초대 링크 복사
          </button>
        </div>

        {/* 하단 고정 CTA */}
        <div style={S.cta}>
          {isHost ? (
            <button style={S.startBtn} onClick={handleRoundStart}>
              ROUND START
            </button>
          ) : (
            <div style={S.waitNotice}>Host가 라운드를 시작하면 자동으로 입장합니다</div>
          )}
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay: { position: "fixed", inset: 0, zIndex: 99998, display: "flex", flexDirection: "column", justifyContent: "flex-end" },
  scrim: { position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)" },
  sheet: {
    position: "relative",
    background: "#1c1c1e",
    color: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "88vh",
    display: "flex",
    flexDirection: "column",
  },
  header: { display: "flex", alignItems: "center", padding: "16px 12px 10px 16px" },
  title: { flex: 1, fontSize: 18, fontWeight: 700 },
  closeBtn: {
    width: 44,
    height: 44,
    background: "transparent",
    border: "none",
    color: "#8e8e93",
    fontSize: 26,
    lineHeight: 1,
  },
  scroll: { padding: "0 16px", overflowY: "auto", flex: 1 },
  codeCard: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "#2c2c2e",
    borderRadius: 10,
    padding: "14px 16px",
    marginBottom: 18,
  },
  codeLabel: { fontSize: 12, color: "#8e8e93" },
  codeValue: { fontSize: 22, fontWeight: 700, letterSpacing: 2 },
  sectionHead: { marginBottom: 8 },
  sectionTitle: { fontSize: 13, color: "#8e8e93", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 },
  memberList: { display: "flex", flexDirection: "column", gap: 8 },
  memberRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "#2c2c2e",
    borderRadius: 10,
    padding: "14px 14px",
    minHeight: 52,
  },
  memberName: { fontSize: 16, display: "inline-flex", alignItems: "center", gap: 8 },
  hostBadge: { fontSize: 11, color: "#ffd60a", border: "1px solid #ffd60a", borderRadius: 6, padding: "2px 6px" },
  memberStatus: { fontSize: 13, color: "#30d158", display: "inline-flex", alignItems: "center", gap: 4 },
  hint: { fontSize: 12, color: "#8e8e93", margin: "10px 0 0" },
  inviteBtn: {
    width: "100%",
    minHeight: 52,
    marginTop: 16,
    background: "#2c2c2e",
    color: "#fff",
    border: "1px solid #3a3a3c",
    borderRadius: 10,
    fontSize: 16,
    fontWeight: 600,
  },
  cta: { padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", borderTop: "1px solid #2c2c2e" },
  startBtn: {
    width: "100%",
    minHeight: 56,
    background: "#0a84ff",
    color: "#fff",
    border: "none",
    borderRadius: 12,
    fontSize: 18,
    fontWeight: 700,
  },
  waitNotice: { textAlign: "center", color: "#8e8e93", fontSize: 14, padding: "16px 0" },
};
