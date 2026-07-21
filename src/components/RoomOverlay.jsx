import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, X, Check, Mic } from "lucide-react";
import { useRoom } from "../context/useRoom.js";
import { useRound } from "../context/useRound.js";
import { useStartRoundFromRoom } from "../room/useStartRoundFromRoom.js";
import { selectJoinedMembers, selectRoomWarnings, ROOM_WARNING_LABELS } from "../room/roomSelectors.js";
import { courseReferenceService, courseProviderA, courseProviderB } from "../course/courseReferenceServiceInstance.js";
import { useCommunication } from "../context/useCommunication.js";
import { useRuntimeMode } from "../context/RuntimeModeContext.jsx";
import { useIdentity } from "../context/useIdentity.js";
import { PttPressController } from "../communication/PttPressController.js";
import VoiceLevelBars from "./VoiceLevelBars.jsx";

// Local Media Capture Stabilization v0.2 §5 — DEV-only raw/smoothed/
// detected debug visibility, same convention as DistanceCard.jsx's DEV
// controls. Never shown to regular users (§10 요청 그대로 유지).
const isDevMode = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;

// Sprint 5.1 §6 — "개발자를 위한 정보는 Production에서 완전히 숨깁니다."
// The test course/club fixture names are literally prefixed "[TEST] " in
// the underlying data (see courseReferenceServiceInstance.js) — real
// users should never see that leak through. Display-only: doesn't touch
// the actual data/IDs, no new state, no new setting.
function displayCourseName(name) {
  if (isDevMode || typeof name !== "string") return name;
  return name.replace(/^\[TEST\]\s*/, "");
}

const RECENT_COMPANIONS = [
  { id: "player_jaegeun", name: "재근" },
  { id: "player_gwangcheon", name: "광천" },
  { id: "player_haeran", name: "해란" },
];

const JOIN_STATUS_LABEL = {
  invited: "초대됨",
  joined: "참여함",
  declined: "초대 취소됨",
  left: "나감",
};

const PTT_TEST_SEQUENCE = ["not_tested", "transmit_confirmed", "receive_confirmed", "completed"];
const PTT_TEST_LABEL = {
  not_tested: "테스트 안 함",
  transmit_confirmed: "송신 확인",
  receive_confirmed: "수신 확인",
  completed: "테스트 완료",
};

/**
 * RoomOverlay — Round Room Foundation v0.1 §4/§5. One overlay, staged
 * sections (동반자 초대 → 참여 상태 → PTT 테스트 → 코스 준비 → Ready Summary
 * → START), matching docs/PRE_ROUND_EXPERIENCE_v1.md §6's "화면 수를
 * 늘리지 말고 하나의 화면 또는 Overlay로" recommendation. Reuses the
 * Gallery Overlay's `.ft-gallery-*` sheet CSS rather than inventing a
 * parallel pattern — same choice the old PreRoundCourseSelect.jsx made,
 * whose course-selection section lives on here unchanged in spirit.
 */
export default function RoomOverlay({ isOpen, onClose, onToast, onStart }) {
  const { room, dispatch, actions } = useRoom();
  const communication = useCommunication();
  const identity = useIdentity();
  const micTestControllerRef = useRef(null);
  if (!micTestControllerRef.current) micTestControllerRef.current = new PttPressController();
  const micTestPressedRef = useRef(false);
  const { networkCommunicationEnabled, setNetworkCommunicationEnabled, locationProvider } = useRuntimeMode();
  const { dispatch: roundDispatch, actions: roundActions, meId } = useRound();
  const { startRoundFromRoom } = useStartRoundFromRoom();

  const [providerChoice, setProviderChoice] = useState("A");
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const [startHole, setStartHole] = useState(1);
  const [pendingWarnings, setPendingWarnings] = useState(null); // null = no confirm modal showing

  useEffect(() => {
    if (!isOpen) return;
    courseReferenceService.setProvider(providerChoice === "B" ? courseProviderB : courseProviderA);
    let cancelled = false;
    courseReferenceService.listAvailableCourses().then((list) => {
      if (cancelled) return;
      setCourses(list);
      setSelectedCourseId(list[0]?.id ?? null);
      setStartHole(1);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, providerChoice]);

  // Real Round UX Audit v1.0 §2 — "GPS 권한 요청 시점을 클럽하우스 대기
  // 흐름으로 이동." Previously the FIRST real navigator.geolocation
  // permission prompt only fired when a DEV control inside
  // DistanceCard.jsx was tapped mid-round — i.e. potentially while the
  // golfer is already preparing a shot (Charter Principle 3: "Don't
  // Interrupt Concentration" violation). Pre-warming here, during the
  // exact window the overlay is designed for (parking → clubhouse →
  // practice green → tee), means the permission dialog is long resolved
  // by the time anyone is standing over a ball. No new button — this is
  // a background side effect of the overlay simply being open. In Demo
  // mode MockLocationProvider resolves instantly with no real dialog, so
  // this is harmless there too.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    locationProvider.getCurrentPosition().then((coord) => {
      if (cancelled || !coord) return;
      roundDispatch(roundActions.playerSetLocation(meId, coord.latitude, coord.longitude));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Mounted/cleanup for the press-hold mic test controller (§1 below) —
  // must run on every render like the effects above, never after an
  // early return, or React sees a different hook count between renders.
  useEffect(() => {
    const controller = micTestControllerRef.current;
    controller.setMounted(true);
    return () => {
      controller.setMounted(false);
      controller.endPress();
      if (micTestPressedRef.current) {
        micTestPressedRef.current = false;
        communication.stopLocalTest();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isOpen) return null;

  // Blocking §5: Room 생성 실패 — the "팀 연결" entry point creates the Room
  // before ever opening this overlay, so reaching here without one means
  // something genuinely went wrong, not a normal state to recover from
  // inside this screen.
  if (!room) {
    return (
      <div className="ft-gallery-overlay">
        <div className="ft-gallery-scrim" onClick={onClose} />
        <div className="ft-gallery-sheet">
          <div className="ft-gallery-sheet-head">
            <span className="ft-gallery-sheet-title">Room을 불러올 수 없습니다</span>
            <button type="button" className="ft-icon-btn" onClick={onClose} aria-label="닫기">
              <X size={16} strokeWidth={2.2} />
            </button>
          </div>
          <p className="ft-gallery-empty">Room 생성에 실패했습니다. 홈으로 돌아가 다시 시도해 주세요.</p>
        </div>
      </div>
    );
  }

  const selectedCourse = courses.find((c) => c.id === selectedCourseId) ?? null;
  const maxHole = selectedCourse?.course.holeCount ?? 18;
  const joined = selectJoinedMembers(room);

  function cycleCompanionStatus(companion) {
    const member = room.members.find((m) => m.userId === companion.id);
    if (!member || member.joinStatus === "declined" || member.joinStatus === "left") {
      dispatch(actions.roomMemberInvite(companion.id, companion.name));
    } else if (member.joinStatus === "invited") {
      dispatch(actions.roomMemberJoin(companion.id));
    } else if (member.joinStatus === "joined") {
      dispatch(actions.roomMemberLeave(companion.id));
    }
  }

  function cyclePttTestStatus(member) {
    const idx = PTT_TEST_SEQUENCE.indexOf(member.pttTestStatus);
    const next = PTT_TEST_SEQUENCE[(idx + 1) % PTT_TEST_SEQUENCE.length];
    dispatch(actions.roomMemberSetPttTestStatus(member.userId, next));
  }

  // Real Round UX Audit v1.0 §1 — "마이크 준비 + PTT 테스트 통합". One
  // gesture (press and hold, release) does what used to take two separate
  // taps: requesting the mic AND confirming it actually works. Reuses the
  // exact same PttPressController race-safety pattern PTTButton.jsx uses,
  // so the very first thing a golfer learns ("hold to talk") is the same
  // gesture the real PTT button uses later — no separate concept to
  // explain. On success this also marks this member's PTT test complete
  // (§6-A's old "가짜 completed로 동일시하지 마세요" now uses a REAL result
  // instead of a DEV-only cycling tap — see the Sprint 결과 보고 for the
  // hidden bug this fixes: real users could never set this before).
  const attemptMicTest = async (generation) => {
    const controller = micTestControllerRef.current;
    const result = await communication.startLocalTest();
    if (!controller.isStillValid(generation)) {
      if (result.ok) communication.stopLocalTest();
      return;
    }
    if (!result.ok) {
      onToast(result.reason === "permission_denied" ? "마이크 권한이 필요합니다" : "마이크를 사용할 수 없습니다");
      return;
    }
    micTestPressedRef.current = true;
  };

  const handleMicTestStart = (e) => {
    e.preventDefault();
    const controller = micTestControllerRef.current;
    if (controller.pointerHeld) return;
    const generation = controller.beginPress();
    controller.runExclusive(generation, attemptMicTest);
  };

  const handleMicTestEnd = () => {
    const controller = micTestControllerRef.current;
    // Capture BEFORE endPress() clears pointerHeld — this is the one
    // signal that distinguishes "released too quickly, while the mic was
    // still activating" from "never pressed at all" / "already done".
    const wasStillActivating = controller.isRequestInFlight && !micTestPressedRef.current;
    controller.endPress();
    if (!micTestPressedRef.current) {
      // Sprint 5.1 §4 — explain the failure instead of silently
      // reverting. This is the exact case Real Round UX Audit v1.0 found:
      // a quick tap (natural first instinct) looked like nothing happened.
      if (wasStillActivating) onToast("조금 더 길게 눌러 주세요");
      return;
    }
    micTestPressedRef.current = false;
    communication.stopLocalTest();
    dispatch(actions.roomMemberSetPttTestStatus(identity.userId, "completed"));
  };

  // §6 — Microphone preparation has 5 distinct states, not to be
  // confused with PTT test's separate 4-state cycle below. "권한 필요"
  // (idle, never asked yet) is deliberately worded differently from
  // "권한 거부" (asked and denied) — they're different situations.
  const myMember = room?.members.find((m) => m.userId === identity.userId);
  const micStatusLabel = communication.isTesting
    ? "듣고 있어요"
    : myMember?.pttTestStatus === "completed"
    ? "확인 완료"
    : communication.state === "permission_denied"
    ? "권한 거부"
    : communication.state === "unavailable"
    ? "사용 불가"
    : communication.state === "preparing"
    ? "준비 중"
    : "누르고 말해보세요";

  function runStart() {
    const result = startRoundFromRoom(selectedCourse, startHole);
    if (!result.ok) {
      // Blocking — Snapshot 생성 실패(또는 그 외 예상 못한 사유): 진행 불가,
      // 확인 모달이 아니라 원인만 안내.
      onToast(`라운드를 시작할 수 없습니다 (${result.reason})`);
      return;
    }
    // Runtime Identity v0.4 §9 — broadcast the EXACT round the host just
    // built to the rest of the room over signaling, so members use this
    // same payload instead of independently building their own (which
    // risks field/timing differences — see the Sprint spec's warning).
    // Only applicable in network mode; local/demo mode is unaffected.
    if (networkCommunicationEnabled && communication.sendRoundStart) {
      communication.sendRoundStart({
        roundId: result.round.id,
        courseSnapshot: selectedCourse,
        startHole,
        startedAt: result.round.startedAt ?? new Date().toISOString(),
        players: result.round.players.map((p) => ({ id: p.id, name: p.name })),
      });
    }
    onToast(`${displayCourseName(selectedCourse.course.name)} ${startHole}번 홀로 라운드를 시작합니다`);
    setPendingWarnings(null);
    onClose();
    onStart();
  }

  function handleStartTap() {
    const warnings = selectRoomWarnings(room, {
      courseSelected: !!selectedCourse,
      startHoleSelected: typeof startHole === "number",
      currentUserId: identity.userId,
    });
    // "host_only"는 Ready Summary("참여 N명")에 항상 이미 보이는 정보라
    // 별도로 막을 필요가 없다 — 자주 정상적으로 발생하는 상황(동반자가
    // 다른 이유로 앱을 안 쓰기로 한 경우)까지 매번 모달로 막으면, 정작
    // 진짜 확인이 필요한 Warning(코스/시작 홀 미선택 등)의 신뢰도까지
    // 같이 떨어진다.
    const blockingWarnings = warnings.filter((w) => w !== "host_only");
    if (blockingWarnings.length > 0) {
      setPendingWarnings(blockingWarnings); // Warning — 확인 후 시작 가능
      return;
    }
    runStart();
  }

  // RC1-WEEK6 Priority 2 — Explicit Leave Room. Three separate systems
  // each own a piece of "connected to a room": the communication client
  // (socket/WebRTC/PTT — communication.leaveRoom() cancels any pending
  // reconnect timer too, so it can never resume after this), the Room
  // Engine (room/member state — roomReset()), and Runtime Mode (whether
  // Network mode is even on). All three must be torn down together or
  // some piece would silently survive and confuse the next "팀 연결".
  function handleLeaveRoom() {
    communication.leaveRoom?.();
    dispatch(actions.roomReset());
    setNetworkCommunicationEnabled(false);
    onClose();
    onToast("팀 연결을 종료했습니다");
  }

  return (
    <div className="ft-gallery-overlay">
      <div className="ft-gallery-scrim" onClick={onClose} />
      <div className="ft-room-overlay-stack">
      <div className="ft-gallery-sheet ft-room-sheet">
        <div className="ft-gallery-sheet-head">
          <span className="ft-gallery-sheet-title">
            팀 연결 · Room {room.code}
          </span>
          <button type="button" className="ft-icon-btn" onClick={onClose} aria-label="닫기">
            <X size={16} strokeWidth={2.2} />
          </button>
        </div>
        {networkCommunicationEnabled && (
          <button type="button" className="ft-room-leave-btn" onClick={handleLeaveRoom}>
            팀 연결 종료
          </button>
        )}

        {/* 동반자 초대 · 참여 상태 (§4) */}
        <div className="ft-room-section">
          <span className="ft-pin-position-label">동반자 초대</span>
          <p className="ft-pin-position-hint">
            <strong>Preview Simulation</strong>
            <br />
            탭하여 참여 상태를 시뮬레이션합니다.
            <br />
            실제 초대 알림은 아직 구현되지 않았습니다.
          </p>
          {isDevMode && <p className="ft-pin-position-hint">DEV: 탭하여 상태 순환(초대→참여→나감)</p>}
          <div className="ft-room-member-list">
            {RECENT_COMPANIONS.map((companion) => {
              const member = room.members.find((m) => m.userId === companion.id);
              const label = member ? JOIN_STATUS_LABEL[member.joinStatus] ?? member.joinStatus : "미초대";
              const isJoined = member?.joinStatus === "joined";
              return (
                <button
                  key={companion.id}
                  type="button"
                  className={`ft-room-member-row ${isJoined ? "is-joined" : ""}`}
                  onClick={() => cycleCompanionStatus(companion)}
                >
                  <span className="ft-room-member-name">{companion.name}</span>
                  <span className="ft-room-member-status">
                    {isJoined && <Check size={11} strokeWidth={3} />}
                    {label}
                    {isJoined ? ` · ${member.connectionStatus === "online" ? "연결됨" : "연결 끊김"}` : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* PTT 테스트 상태 (§4/§5, DEV 시뮬레이션) + 실제 마이크 준비(§6-A) */}
        {joined.length > 0 && (
          <div className="ft-room-section">
            {isDevMode && (
              <div className="ft-pin-position-row">
                <span className="ft-pin-position-label">
                  실제 음성 연결(Network) <span className="ft-dev-badge">DEV</span>
                </span>
                <div className="ft-pin-position-pills">
                  <button
                    className={`ft-pin-pill ${!networkCommunicationEnabled ? "is-active" : ""}`}
                    onClick={() => setNetworkCommunicationEnabled(false)}
                  >
                    Local
                  </button>
                  <button
                    className={`ft-pin-pill ${networkCommunicationEnabled ? "is-active" : ""}`}
                    onClick={() => setNetworkCommunicationEnabled(true)}
                  >
                    Network
                  </button>
                </div>
              </div>
            )}
            {isDevMode && networkCommunicationEnabled && (
              <p className="ft-pin-position-hint">
                Network 모드: signaling 서버(ws://localhost:8787)가 실행 중이어야 합니다. ROUND START 후 실제 Round
                화면의 PTT로 재근과 실제 음성을 주고받습니다.
              </p>
            )}
            <span className="ft-pin-position-label">마이크</span>
            <div className="ft-room-member-list">
              <button
                type="button"
                className={`ft-room-member-row ${communication.isTesting ? "is-active" : ""}`}
                onPointerDown={handleMicTestStart}
                onPointerUp={handleMicTestEnd}
                onPointerLeave={handleMicTestEnd}
                onPointerCancel={handleMicTestEnd}
                onContextMenu={(e) => e.preventDefault()}
              >
                <span className="ft-room-member-name">
                  <Mic size={14} strokeWidth={2.2} style={{ marginRight: 6, verticalAlign: "-2px" }} />
                  내 마이크
                </span>
                {communication.isTesting ? (
                  <VoiceLevelBars active={true} level={communication.inputLevel} voiceDetected={communication.voiceDetected} count={5} />
                ) : (
                  <span className="ft-room-member-status">{micStatusLabel}</span>
                )}
              </button>
            </div>
            {isDevMode && (
              <p className="ft-pin-position-hint" style={{ marginTop: 4 }}>
                DEV raw={communication.rawInputLevel.toFixed(2)} smoothed={communication.inputLevel.toFixed(2)}{" "}
                detected={communication.voiceDetected ? "true" : "false"}
              </p>
            )}
            {isDevMode && networkCommunicationEnabled && (
              <p className="ft-pin-position-hint" style={{ marginTop: 2 }}>
                DEV conn={communication.connectionState ?? "?"} members={communication.members?.length ?? 0}{" "}
                lastError={communication.lastError ?? "none"} retry={communication.retryCount ?? 0}{" "}
                nextRetrySec={communication.nextRetrySec ?? "-"}
              </p>
            )}
            {isDevMode && (
              <>
                <span className="ft-pin-position-label" style={{ marginTop: 10, display: "block" }}>
                  PTT 테스트 (DEV 시뮬레이션)
                </span>
                <div className="ft-room-member-list">
                  {joined.map((member) => (
                    <button
                      key={member.userId}
                      type="button"
                      className="ft-room-member-row"
                      onClick={() => cyclePttTestStatus(member)}
                    >
                      <span className="ft-room-member-name">{member.displayName}</span>
                      <span className="ft-room-member-status">{PTT_TEST_LABEL[member.pttTestStatus]}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* 코스 준비 (기존 PreRoundCourseSelect 로직 그대로, §4 흡수) */}
        <div className="ft-room-section">
          <span className="ft-pin-position-label">코스 준비</span>
          {isDevMode && (
            <div className="ft-preround-provider-row">
              <span className="ft-pin-position-label">Provider (DEV)</span>
              <div className="ft-pin-position-pills">
                <button
                  className={`ft-pin-pill ${providerChoice === "A" ? "is-active" : ""}`}
                  onClick={() => setProviderChoice("A")}
                >
                  Provider A
                </button>
                <button
                  className={`ft-pin-pill ${providerChoice === "B" ? "is-active" : ""}`}
                  onClick={() => setProviderChoice("B")}
                >
                  Provider B
                </button>
              </div>
            </div>
          )}

          <div className="ft-preround-course-list">
            {courses.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`ft-preround-course-row ${selectedCourseId === c.id ? "is-selected" : ""}`}
                onClick={() => setSelectedCourseId(c.id)}
              >
                <span className="ft-preround-course-name">
                  {displayCourseName(c.golfClub.name)} · {displayCourseName(c.course.name)}
                </span>
                <span className="ft-preround-course-meta">
                  {c.course.holeCount}홀{isDevMode ? ` · Level ${c.dataLevel} · ${c.source}` : ""}
                </span>
              </button>
            ))}
            {courses.length === 0 && <p className="ft-gallery-empty">불러올 수 있는 코스가 없습니다.</p>}
          </div>

          {selectedCourse && (
            <div className="ft-preround-start-hole-row">
              <span className="ft-pin-position-label">시작 홀</span>
              <div className="ft-stepper">
                <button onClick={() => setStartHole((h) => Math.max(1, h - 1))} aria-label="이전 홀">
                  <ChevronLeft size={13} strokeWidth={2.4} />
                </button>
                <div className="ft-stepper-center">
                  <span className="ft-stepper-value">{startHole}</span>
                  <span className="ft-stepper-raw">번 홀</span>
                </div>
                <button onClick={() => setStartHole((h) => Math.min(maxHole, h + 1))} aria-label="다음 홀">
                  <ChevronLeft size={13} strokeWidth={2.4} style={{ transform: "rotate(180deg)" }} />
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* RC1-WEEK4 Root Cause Fix: footer is now a TRUE SIBLING of the
          scrollable sheet (not nested inside it, not position:sticky) —
          see docs/ for the full render-tree diagnosis. This eliminates
          the shared-scroll-container mechanism that caused it to overlap
          the mic row in both previous attempts. */}
      <div className="ft-room-overlay-footer">
        <div className="ft-room-ready-summary">
          <span>Host {room.members.find((m) => m.userId === room.hostUserId)?.displayName}</span>
          <span>참여 {joined.length}명</span>
          <span>{selectedCourse ? `${displayCourseName(selectedCourse.course.name)} ${startHole}번 홀` : "코스 미선택"}</span>
        </div>

        {pendingWarnings && (
          <div className="ft-room-warning-confirm">
            <p>
              {pendingWarnings.map((w) => ROOM_WARNING_LABELS[w]).join(" · ")}
              <br />
              그래도 시작하시겠습니까?
            </p>
            <div className="ft-pin-position-pills">
              <button className="ft-pin-pill" onClick={() => setPendingWarnings(null)}>
                취소
              </button>
              <button className="ft-pin-pill is-active" onClick={runStart}>
                시작
              </button>
            </div>
          </div>
        )}

        <button type="button" className="ft-hole-complete-btn" onClick={handleStartTap} disabled={!selectedCourse}>
          ROUND START
        </button>
      </div>
      </div>
    </div>
  );
}
