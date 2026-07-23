import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Mic, PartyPopper, Share2, X } from "lucide-react";
import { useRound } from "../context/useRound.js";
import { useNowTick } from "../hooks/useNowTick.js";
import { useRuntimeMode } from "../context/RuntimeModeContext.jsx";
import { RUNTIME_MODES } from "../config/runtimeMode.js";
import { useCommunication } from "../context/useCommunication.js";
import { useRoom } from "../context/useRoom.js";
import { clearActiveRoomRef } from "../room/activeRoomRef.js";
import { formatParRelative } from "../utils/scoreFormat.js";
import {
  selectCurrentHole,
  selectCurrentHoleScores,
  selectIsLastHole,
  selectPlayerCompletedHoleCount,
  selectPlayerSummary,
  selectPlayerTotalStrokes,
  selectPlayerTotalToPar,
  selectPlayers,
  selectSpeakingPlayer,
} from "../engine/roundSelectors.js";
import PlayerCard from "./PlayerCard.jsx";
import PTTButton from "./PTTButton.jsx";
import DistanceCard from "./DistanceCard.jsx";
import GalleryPanel from "./GalleryPanel.jsx";
import ScoreCard from "./ScoreCard.jsx";
import PoDiagnosticPanel from "./PoDiagnosticPanel.jsx"; // RC4 TEMPORARY — remove after device verification
import { RC4_BUILD_STAMP } from "../config/buildStamp.js";

// 8-point compass — "Compact First": a single arrow + 2-letter label is
// enough context for a golfer glancing at the header, no need to spell out
// "북서풍" etc.
// Sprint 5.2 — wind description moved to DistanceCard.jsx (grouped with
// distance, not the header — see the Information Hierarchy note there).

// Sprint 3 "Player Row = Selection": who I'm about to talk to when I next
// press PTT. Deliberately NOT Round Engine state — like `muted` was in
// earlier sprints, this is "my own current UI intent," not something any
// other player needs to see synced. "all" is a distinct selectable target
// (§5 — not merely "nothing selected"), and is mutually exclusive with
// picking specific players: choosing one clears the other.

// RC4 UI — iOS Action Sheet styling. Founder: the confirm dialogs appeared
// as a small box at the bottom-left; the requirement is a full-width,
// bottom-anchored sheet with large (>=56px) tap targets, like a native iOS
// action sheet. Defined here as constants so every sheet matches exactly.
const SHEET_BTN_BASE = {
  display: "block",
  width: "100%",
  minHeight: 56,
  fontSize: 17,
  fontWeight: 600,
  borderRadius: 12,
  border: "none",
  marginBottom: 10,
  padding: "16px 12px",
  cursor: "pointer",
};
const SHEET_BTN_PLAIN = { ...SHEET_BTN_BASE, background: "#2c2c2e", color: "#fff" };
const SHEET_BTN_DANGER = { ...SHEET_BTN_BASE, background: "#3a2a2a", color: "#ff453a" };
const SHEET_BTN_CANCEL = { ...SHEET_BTN_BASE, background: "#3a3a3c", color: "#fff", marginBottom: 0 };

const ALL_TARGET = "all";

function toggleTarget(prevSet, id) {
  const next = new Set(prevSet);
  if (id === ALL_TARGET) {
    if (next.has(ALL_TARGET)) {
      next.clear();
    } else {
      next.clear();
      next.add(ALL_TARGET);
    }
    return next;
  }
  if (next.has(ALL_TARGET)) next.delete(ALL_TARGET);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function describeTargets(selectedTargets, players) {
  if (selectedTargets.size === 0) return "대상 없음";
  if (selectedTargets.has(ALL_TARGET)) return "전체에게 전송";
  const names = players.filter((p) => selectedTargets.has(p.id)).map((p) => p.name);
  if (names.length === 0) return "대상 없음";
  return `${names.join(" · ")}에게 전송`;
}

// Local Media Capture Prototype v0.1 §5/docs/REAL_PTT_ARCHITECTURE_v1.md §4:
// resolves the local target Set into the actual user ID array
// Communication needs to receive a real transmit request. "all" resolves
// here (not deferred to a server, since there's no network yet this
// Sprint) to every OTHER player currently in the round.
function resolveTargetUserIds(selectedTargets, otherPlayers) {
  if (selectedTargets.has(ALL_TARGET)) return otherPlayers.map((p) => p.id);
  return otherPlayers.filter((p) => selectedTargets.has(p.id)).map((p) => p.id);
}

// Score Compact/Collapsible UI: one line summarizing whoever has actually
// entered a score for this hole so far — never a placeholder number, since
// selectCurrentHoleScores() already distinguishes "not entered" (null)
// from a real entered value. Score Input UX: shows PAR-relative (E/+1/-2)
// like the expanded stepper does, not raw strokes — "재식 E · 재근 +1".
function describeScoreSummary(scores, players, par) {
  const entered = players.filter((p) => scores[p.id] != null);
  if (entered.length === 0) return "미입력";
  return entered.map((p) => `${p.name} ${formatParRelative(scores[p.id], par)}`).join(" · ");
}

export default function RoundScreen({ onBack, onGoHome, onLeaveRoom, onEndRound, onToast }) {
  const { round, meId, dispatch, actions, startPtt, stopPtt, completeCurrentHoleAndAdvance } = useRound();

  const hole = selectCurrentHole(round);
  const players = selectPlayers(round);
  const speaker = selectSpeakingPlayer(round);
  const isLastHole = selectIsLastHole(round);

  // Sprint 2 "Player First UI": one tick, one pass over selectPlayerSummary
  // for all 4 players — replaces the old two separate sections ("동반자
  // GPS" inside DistanceCard, "참가자 상태" here) with one merged panel.
  const now = useNowTick(500);
  const { mode: runtimeMode, networkCommunicationEnabled } = useRuntimeMode();
  const communication = useCommunication();
  const { room } = useRoom(); // RC4 — for host detection in the exit action sheet
  // Two Device Bidirectional Hardening v0.2 Part G: only ever overrides
  // the OTHER players' speaking display, and only while network
  // communication is explicitly on (App.jsx's CommunicationBridge is the
  // only thing that turns this on) — my own row keeps using local Round
  // state (`startPtt`/`stopPtt`), exactly as before.
  const playerSummaries = players.map((p) => {
    const speakingOverride = !networkCommunicationEnabled
      ? undefined
      : p.id === meId
      ? undefined
      : communication.isReceiving && communication.remoteSpeakerUserId === p.id;
    return selectPlayerSummary(round, p.id, now, { runtimeMode, speakingOverride });
  });

  // Part G: "전역으로 모든 클라이언트에 isSpeaking을 broadcast하는 기존
  // 방식으로 되돌아가지 마세요" — this replaces the raw `speaker` variable
  // for DISPLAY purposes only when network communication is active. My
  // own speaking state still comes from local Round state either way;
  // only "who else is speaking" changes source (remoteSpeaker, and only
  // if I'm an actual target — never a global broadcast).
  const displaySpeakerName = !networkCommunicationEnabled
    ? speaker
      ? speaker.id === meId
        ? "나"
        : speaker.name
      : null
    : speaker && speaker.id === meId
    ? "나"
    : communication.isReceiving
    ? communication.remoteSpeakerName
    : null;

  const par = hole ? hole.par : 4;
  const holeNumber = hole ? hole.number : round.currentHoleNumber;
  // Sprint 5.2 — windLabel removed; wind now renders inside DistanceCard.

  const completedHoleCount = selectPlayerCompletedHoleCount(round, meId);
  const totalStrokes = selectPlayerTotalStrokes(round, meId);
  const totalToPar = selectPlayerTotalToPar(round, meId);
  const formatToParLabel = (toPar, completedCount) =>
    completedCount === 0 ? "-" : toPar === 0 ? "E" : toPar > 0 ? `+${toPar}` : `${toPar}`;
  const totalStrokesLabel = completedHoleCount === 0 ? "-" : String(totalStrokes);
  const totalToParLabel = formatToParLabel(totalToPar, completedHoleCount);

  // Score Compact/Collapsible UI: collapsed by default so the score panel
  // doesn't compete with the one-screen layout. Reuses the existing
  // selectCurrentHoleScores() selector — no new Round Engine state.
  const [isScoreExpanded, setIsScoreExpanded] = useState(false);
  const currentHoleScores = selectCurrentHoleScores(round);
  const scoreSummary = describeScoreSummary(currentHoleScores, players, par);

  // Score Input UX 최종 정리: "스코어 패널을 여는 행위가 입력 시작이다." Opening
  // the panel (when I have no real score for this hole yet) starts a local
  // draft at `par` (E) — not written to scoreByHole. +/- adjust this draft.
  // Only completing the hole while a draft exists commits it, via the
  // existing playerSetScore action. Never opening the panel this hole means
  // draftStrokes stays null and nothing is ever committed on my behalf.
  const [draftStrokes, setDraftStrokes] = useState(null);
  useEffect(() => {
    setDraftStrokes(null); // a new hole always starts with no draft
  }, [holeNumber]);

  const handleOpenScorePanel = () => {
    if (currentHoleScores[meId] == null && draftStrokes == null) {
      setDraftStrokes(par);
    }
    setIsScoreExpanded(true);
  };

  // Sprint 3: local-only PTT target selection (see toggleTarget/describeTargets
  // above for why this isn't Round Engine state).
  // RC4 PTT UX — default the target to "전체" (everyone) so PTT is usable
  // immediately and the "전체" row's selected state reflects a REAL
  // selection, not an ambiguous default that looks selected but blocks
  // transmit. Tapping "전체" again, or picking specific people, changes it
  // exactly as before via toggleTarget.
  const [selectedTargets, setSelectedTargets] = useState(() => new Set([ALL_TARGET]));
  const handleToggleTarget = (id) => setSelectedTargets((prev) => toggleTarget(prev, id));
  const otherPlayers = players.filter((p) => p.id !== meId);
  const targetLabel = describeTargets(selectedTargets, otherPlayers);
  // RC4 PTT — separate "did the user SELECT a target" from "do any actual
  // recipients EXIST". A solo host has 전체 selected (hasSelection=true) but
  // zero connected companions (targetUserIds=[]), which must be explained
  // as "연결된 동반자 없음", NOT "먼저 대상을 선택하세요".
  const hasSelection = selectedTargets.size > 0;
  const targetUserIds = resolveTargetUserIds(selectedTargets, otherPlayers);
  const hasRecipients = targetUserIds.length > 0;
  // PTT can transmit only when there is at least one real recipient.
  const canTransmit = hasSelection && hasRecipients;
  const blockedMessage = !hasSelection
    ? "먼저 전달할 대상을 선택하세요."
    : "현재 연결된 동반자가 없습니다.";


  // "Gallery는 하나의 독립 화면이 아니라 Overlay UI" — closed by default, opened
  // by a small trigger, and closed again automatically once something is
  // selected inside it. Rendered outside .ft-round-scroll (see JSX below) so
  // it never affects — or is affected by — the page's scroll position.
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [showEndRoundConfirm, setShowEndRoundConfirm] = useState(false); // P1-4 fix
  const [showExitSheet, setShowExitSheet] = useState(false); // RC4 — 라운드 나가기 액션 시트
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false); // RC4 — 방 나가기 확인

  const amHost = room?.hostUserId === meId;

  // RC4 — three DISTINCT exits from the action sheet. Each delegates to the
  // matching App-level handler so the state transitions never overlap.
  const handleGoHomeFromSheet = () => {
    setShowExitSheet(false);
    (onGoHome ?? onBack)?.(); // navigation only
  };
  const handleLeaveRoomConfirmed = () => {
    setShowLeaveConfirm(false);
    setShowExitSheet(false);
    onLeaveRoom?.(); // full room teardown (identity kept)
  };

  const handleEndRoundConfirmed = () => {
    setShowEndRoundConfirm(false);
    setShowExitSheet(false);
    if (onEndRound) {
      onEndRound(); // App-level: roundComplete + keep Room + home
    } else {
      // Fallback (older wiring): local completion.
      dispatch(actions.roundComplete());
      clearActiveRoomRef();
    }
  };

  /* Demo: simulate an incoming transmission from a companion via the Round
   * Engine itself (still respects the "only one speaker" guard — if the
   * user happens to be transmitting at the same moment, this is correctly
   * rejected by startPtt just like a real second speaker would be).
   *
   * RC4 CRITICAL REGRESSION FIX — this scripted demo transmission ("해란이
   * 말하는 중") must NEVER run in a real network round. Two hard guards:
   *   (1) networkCommunicationEnabled must be false, and
   *   (2) runtimeMode must be the demo mode.
   * Both are checked INSIDE the effect body (not just as a render
   * condition) and the effect is a genuine no-op otherwise — a UI
   * rendering condition alone was insufficient (that was the RC4 bug: the
   * timer fired regardless of mode and injected player_haeran into the
   * round). It also never references a hardcoded demo id unless the demo
   * seed is actually the active round, so it can't inject a phantom
   * player into any Room-started round even if a mode flag were wrong. */
  const demoRanRef = useRef(false);
  useEffect(() => {
    // Guard 1 — never in a live network room.
    if (networkCommunicationEnabled) return;
    // Guard 2 — only in explicit demo runtime mode.
    if (runtimeMode !== RUNTIME_MODES.DEMO) return;
    // Guard 3 — only when the actual demo seed round is loaded, and only
    // when its scripted speaker (player_haeran) is a real member of it.
    // This makes the effect structurally incapable of injecting a demo id
    // into any non-seed round.
    if (round.id !== "round_demo_001") return;
    if (!round.players.some((p) => p.id === "player_haeran")) return;
    if (demoRanRef.current) return;
    demoRanRef.current = true;
    const t1 = setTimeout(() => {
      startPtt("player_haeran");
      const t2 = setTimeout(() => {
        stopPtt("player_haeran");
      }, 2600);
      return () => clearTimeout(t2);
    }, 3200);
    return () => clearTimeout(t1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [networkCommunicationEnabled, runtimeMode, round.id]);

  const handleCompleteHole = () => {
    // Score Input UX 최종 정리: if I opened the score panel this hole (a
    // draft exists) and never got a real committed score some other way,
    // commit the draft's CURRENT value now — E if untouched, or whatever
    // +/- adjusted it to. If the panel was never opened this hole,
    // draftStrokes is still null and nothing gets written — "패널을 열지
    // 않음 = 입력 의도 없음 = 미입력 유지".
    if (currentHoleScores[meId] == null && draftStrokes != null) {
      dispatch(actions.playerSetScore(meId, holeNumber, draftStrokes));
    }
    completeCurrentHoleAndAdvance();
    setIsScoreExpanded(false);
    setDraftStrokes(null);
    if (isLastHole) {
      onToast("라운드를 완료했습니다 🎉");
    } else {
      onToast(`${holeNumber + 1}번 홀로 이동했습니다`);
    }
  };

  // RC4 CRITICAL REGRESSION FIX — an un-hydrated network round (clean
  // baseline, no server snapshot applied yet) must show a neutral loading
  // state, NEVER demo players. `pending`/isNetworkBaseline with no real
  // players is exactly that window. An empty/loading network state is
  // acceptable per Founder's rules; demo fallback is not.
  const isPendingNetworkRound =
    networkCommunicationEnabled &&
    (round.status === "pending" || round.isNetworkBaseline === true) &&
    players.length === 0;

  // RC4 diagnostic — [ROUND SCREEN STATE]: the exact values that decide the
  // loading gate, logged on every render so a device test shows precisely
  // why RoundScreen is (or isn't) showing "라운드 준비 중".
  // eslint-disable-next-line no-console
  console.log(
    "[ROUND SCREEN STATE]",
    `roundId=${round.id}`,
    `status=${round.status}`,
    `isNetworkBaseline=${round.isNetworkBaseline === true}`,
    `players.length=${players.length}`,
    `networkCommunicationEnabled=${networkCommunicationEnabled}`,
    `loadingGate=${isPendingNetworkRound}`
  );

  if (isPendingNetworkRound) {
    // eslint-disable-next-line no-console
    console.log("[ROUND HYDRATE SOURCE]", "source=server_snapshot (pending)");
    return (
      <div className="ft-screen ft-round">
        <PoDiagnosticPanel
          round={round}
          players={players}
          loadingGate={true}
          networkCommunicationEnabled={networkCommunicationEnabled}
          buildStamp={RC4_BUILD_STAMP}
          roomCode={room?.code}
          roomStatus={room?.status}
        />
        <div className="ft-round-scroll">
          <div className="ft-compact-header">
            <button className="ft-icon-btn" onClick={onBack} aria-label="뒤로">
              <ChevronLeft size={18} strokeWidth={2.2} />
            </button>
            <div className="ft-compact-header-text">
              <div className="ft-compact-course">라운드 준비 중</div>
              <div className="ft-compact-hole">Host가 라운드를 시작하면 참가자가 표시됩니다</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ft-screen ft-round">
      <PoDiagnosticPanel
        round={round}
        players={players}
        loadingGate={false}
        networkCommunicationEnabled={networkCommunicationEnabled}
        buildStamp={RC4_BUILD_STAMP}
        roomCode={room?.code}
        roomStatus={room?.status}
      />
      {displaySpeakerName && (
        <div className="ft-live-badge">
          <span className="ft-live-badge-dot" />
          LIVE · {displaySpeakerName}
        </div>
      )}

      <div className="ft-round-scroll">
        {/* Compact header — "약 절반 수준" target: one icon row + two text
            lines, no big hero hole number, no decorative artwork. */}
        <div className="ft-compact-header">
          <button
            onClick={() => setShowExitSheet(true)}
            aria-label="라운드 메뉴"
            // RC4 UI — Founder: "체감상 거의 동일". The previous minWidth/
            // minHeight was being constrained by .ft-icon-btn's own sizing,
            // so the class is dropped here and the button is sized
            // explicitly: 52x52 hit area, larger glyph, negative margin so
            // the bigger box doesn't shift the header layout.
            style={{
              width: 52,
              height: 52,
              margin: "-6px -6px -6px -10px",
              padding: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              flexShrink: 0,
              WebkitTapHighlightColor: "rgba(255,255,255,0.15)",
            }}
          >
            <ChevronLeft size={28} strokeWidth={2.4} />
          </button>
          <div className="ft-compact-header-info">
            <div className="ft-compact-header-line1">
              {holeNumber}H <span className="ft-compact-sep">|</span> PAR{par}
              <span className="ft-compact-sep">|</span>
              <b>{totalToParLabel}</b>
              <span className="ft-compact-strokes">({totalStrokesLabel})</span>
            </div>
          </div>
          <button
            className="ft-icon-btn"
            onClick={() => setShowEndRoundConfirm(true)}
            aria-label="라운드 종료"
          >
            <X size={16} strokeWidth={2.1} />
          </button>
          <button
            className="ft-icon-btn"
            onClick={() => onToast("스코어카드 공유 기능은 준비 중입니다")}
            aria-label="공유"
          >
            <Share2 size={16} strokeWidth={2.1} />
          </button>
        </div>

        {/* Distance — "Distance First": placed right under the header, never
            pushed down by Gallery/Score/등 다른 섹션. */}
        <div className="ft-section ft-section-tight">
          <DistanceCard onToast={onToast} />
        </div>

        {/* Player Summary — Sprint 2 "Player First UI", now doubling as the
            PTT target picker (Sprint 3): the whole row is the tap target,
            not a small icon (§1). "전체" is its own selectable row (§5),
            positioned first since it's the primary way most calls will go
            out ("포어!" etc.) — my own row is never selectable. Sprint 3
            긴급 수정 §2: section title removed and margins tightened so
            this reads as one compact team panel, not a titled section, and
            so PTT fits above the fold. */}
        <div className="ft-section ft-section-compact">
          <div className="ft-player-summary-panel">
            <button
              type="button"
              className={`ft-player-row ft-player-row-all ${selectedTargets.has("all") ? "is-selected" : ""}`}
              onClick={() => handleToggleTarget("all")}
              aria-pressed={selectedTargets.has("all")}
            >
              <span className="ft-player-row-all-icon">📢</span>
              <span className="ft-player-row-all-label">전체</span>
              <span className={`ft-player-row-target-icon ${selectedTargets.has("all") ? "is-selected" : ""}`}>
                <Mic size={13} strokeWidth={2.4} />
              </span>
            </button>
            {playerSummaries.map((summary) => {
              const isMe = summary.id === meId;
              return (
                <PlayerCard
                  key={summary.id}
                  summary={summary}
                  isMe={isMe}
                  isSelectable={!isMe}
                  isSelected={selectedTargets.has(summary.id)}
                  onToggleSelect={() => handleToggleTarget(summary.id)}
                />
              );
            })}
          </div>
        </div>

        {displaySpeakerName && displaySpeakerName !== "나" && (
          <div className="ft-speaker-banner">
            <div className="ft-wave">
              <span />
              <span />
              <span />
              <span />
            </div>
            {displaySpeakerName}님이 말하는 중
          </div>
        )}

        {/* PTT — Sprint 3: gated on a target being selected, with a
            persistent label showing who's currently addressed (§6). The
            label lives here, not inside PTTButton.jsx, so that file only
            needed the two new gating props — no JSX changes inside it. */}
        <div className="ft-ptt-target-label">{targetLabel}</div>
        <PTTButton
          onToast={onToast}
          canTransmit={canTransmit}
          onBlockedPress={() => onToast(blockedMessage)}
          targetUserIds={targetUserIds}
        />

        {/* Gallery trigger — the panel itself is an overlay (rendered below,
            outside the scroll), not a permanent section. */}
        <button type="button" className="ft-gallery-trigger" onClick={() => setGalleryOpen(true)}>
          <PartyPopper size={16} strokeWidth={2.2} />
          응원 · 효과음
        </button>

        {/* Score — Compact/Collapsible UI: collapsed by default (one tap
            target, summary text, chevron) so it doesn't compete with the
            one-screen layout. Tapping expands the existing ScoreCard +
            complete/next-hole button; completing auto-collapses again. */}
        <div className="ft-section">
          {round.status === "completed" ? (
            <div className="ft-round-complete-summary">
              <div className="ft-round-complete-title">{round.currentHoleNumber}홀 완료</div>
              <div className="ft-round-complete-scores">
                {round.players.map((p) => {
                  const strokes = selectPlayerTotalStrokes(round, p.id);
                  const toPar = selectPlayerTotalToPar(round, p.id);
                  return (
                    <div className="ft-round-complete-row" key={p.id}>
                      <span className="ft-round-complete-name">
                        {p.name}
                        {p.id === meId ? " (나)" : ""}
                      </span>
                      <span className="ft-round-complete-score">
                        {strokes}타 ({formatToParLabel(toPar, 1)})
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="ft-round-complete-thanks">플레이해 주셔서 감사합니다.</p>
              <button
                className="ft-hole-complete-btn"
                onClick={() => {
                  dispatch(actions.roundReset());
                  onBack();
                }}
              >
                홈으로
              </button>
            </div>
          ) : !isScoreExpanded ? (
            <button
              type="button"
              className="ft-score-collapsed-row"
              onClick={handleOpenScorePanel}
            >
              <span className="ft-score-collapsed-title">{holeNumber}번 홀 스코어</span>
              <span className="ft-score-collapsed-summary">{scoreSummary}</span>
              <ChevronRight size={16} strokeWidth={2.2} className="ft-score-collapsed-chevron" />
            </button>
          ) : (
            <>
              <button
                type="button"
                className="ft-score-expanded-head"
                onClick={() => setIsScoreExpanded(false)}
              >
                <span className="ft-section-title">{holeNumber}번 홀</span>
                <span className="ft-section-meta">PAR {par}</span>
              </button>
              <ScoreCard draftStrokes={draftStrokes} onDraftChange={setDraftStrokes} />
              <button className="ft-hole-complete-btn" onClick={handleCompleteHole}>
                {isLastHole ? `${holeNumber}번 홀 완료 · 라운드 종료` : `${holeNumber}번 홀 완료 · 다음 홀로`}
              </button>
            </>
          )}
        </div>
        <div className="ft-bottom-spacer" />
      </div>

      <GalleryPanel isOpen={galleryOpen} onClose={() => setGalleryOpen(false)} onToast={onToast} />

      {/* RC4 — 라운드 화면 나가기 액션 시트. 세 동작을 명시적으로 분리한다:
          홈으로 이동(navigation only) / 방 나가기(room teardown) /
          라운드 종료(roundComplete, Room 유지). 같은 의미로 처리되지 않는다. */}
      {showExitSheet && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100000, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} onClick={() => setShowExitSheet(false)} />
          <div style={{ position: "relative", background: "#1c1c1e", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: "20px 16px calc(20px + env(safe-area-inset-bottom))", color: "#fff" }}>
            <div style={{ textAlign: "center", fontSize: 13, color: "#8e8e93", marginBottom: 14 }}>라운드 메뉴</div>
            <div>
              <button style={SHEET_BTN_PLAIN} onClick={handleGoHomeFromSheet}>
                홈으로 이동 (라운드 유지)
              </button>
              <button
                style={SHEET_BTN_PLAIN}
                onClick={() => {
                  // RC4 P0-3 — CLOSE the sheet first. The sheet is a
                  // full-screen ft-gallery-overlay rendered AFTER these
                  // dialogs, so leaving it open completely covers the
                  // confirm dialog: the tap looked like "no response", and
                  // both dialogs appeared at once only when the sheet was
                  // finally dismissed.
                  setShowExitSheet(false);
                  setShowEndRoundConfirm(true);
                }}
              >
                라운드 종료
              </button>
              <button
                style={SHEET_BTN_DANGER}
                onClick={() => {
                  setShowExitSheet(false);
                  setShowLeaveConfirm(true);
                }}
              >
                방 나가기
              </button>
              <button style={SHEET_BTN_CANCEL} onClick={() => setShowExitSheet(false)}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RC4 P0-3 — 확인 다이얼로그는 액션 시트보다 "뒤에" 렌더되어야
          시트에 가려지지 않는다(이전 버그: 시트가 full-screen overlay라
          다이얼로그를 완전히 덮어 "눌러도 반응 없음"으로 보였고, 시트를
          닫는 순간 두 개가 동시에 나타났다). 또한 두 다이얼로그는 상호
          배타적으로 렌더해 절대 동시에 뜨지 않는다. */}
      {showEndRoundConfirm && !showExitSheet && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100000, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} onClick={() => setShowEndRoundConfirm(false)} />
          <div style={{ position: "relative", background: "#1c1c1e", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: "20px 16px calc(20px + env(safe-area-inset-bottom))", color: "#fff" }}>
            <p style={{ fontSize: 15, lineHeight: 1.5, margin: "0 0 16px", textAlign: "center", color: "#d1d1d6" }}>
              라운드를 종료할까요?
              <br />
              지금까지의 스코어가 저장되고 홈으로 돌아갑니다.
            </p>
            <button style={SHEET_BTN_DANGER} onClick={handleEndRoundConfirmed}>
              라운드 종료
            </button>
            <button style={SHEET_BTN_CANCEL} onClick={() => setShowEndRoundConfirm(false)}>
              계속 플레이
            </button>
          </div>
        </div>
      )}

      {showLeaveConfirm && !showExitSheet && !showEndRoundConfirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100000, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} onClick={() => setShowLeaveConfirm(false)} />
          <div style={{ position: "relative", background: "#1c1c1e", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: "20px 16px calc(20px + env(safe-area-inset-bottom))", color: "#fff" }}>
            <p style={{ fontSize: 15, lineHeight: 1.5, margin: "0 0 16px", textAlign: "center", color: "#d1d1d6" }}>
              {amHost ? (
                <>
                  방을 나가면 Host 권한이 다른 참가자에게 이전됩니다.
                  <br />
                  참가자가 없으면 방이 종료됩니다.
                </>
              ) : (
                <>방에서 나가시겠습니까?</>
              )}
            </p>
            <button style={SHEET_BTN_DANGER} onClick={handleLeaveRoomConfirmed}>
              방 나가기
            </button>
            <button style={SHEET_BTN_CANCEL} onClick={() => setShowLeaveConfirm(false)}>
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
