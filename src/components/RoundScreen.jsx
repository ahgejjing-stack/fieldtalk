import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Mic, PartyPopper, Share2 } from "lucide-react";
import { useRound } from "../context/useRound.js";
import { useNowTick } from "../hooks/useNowTick.js";
import { useRuntimeMode } from "../context/RuntimeModeContext.jsx";
import { useCommunication } from "../context/useCommunication.js";
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

export default function RoundScreen({ onBack, onToast }) {
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
  const [selectedTargets, setSelectedTargets] = useState(() => new Set());
  const handleToggleTarget = (id) => setSelectedTargets((prev) => toggleTarget(prev, id));
  const targetLabel = describeTargets(selectedTargets, players.filter((p) => p.id !== meId));
  const hasTarget = selectedTargets.size > 0;
  const targetUserIds = resolveTargetUserIds(selectedTargets, players.filter((p) => p.id !== meId));


  // "Gallery는 하나의 독립 화면이 아니라 Overlay UI" — closed by default, opened
  // by a small trigger, and closed again automatically once something is
  // selected inside it. Rendered outside .ft-round-scroll (see JSX below) so
  // it never affects — or is affected by — the page's scroll position.
  const [galleryOpen, setGalleryOpen] = useState(false);

  /* Demo: simulate an incoming transmission from a companion via the Round
   * Engine itself (still respects the "only one speaker" guard — if the
   * user happens to be transmitting at the same moment, this is correctly
   * rejected by startPtt just like a real second speaker would be). */
  const demoRanRef = useRef(false);
  useEffect(() => {
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
  }, []);

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

  return (
    <div className="ft-screen ft-round">
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
          <button className="ft-icon-btn" onClick={onBack} aria-label="뒤로">
            <ChevronLeft size={18} strokeWidth={2.2} />
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
          canTransmit={hasTarget}
          onBlockedPress={() => onToast("먼저 전달할 대상을 선택하세요.")}
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
              <div className="ft-round-complete-title">{round.holes.length}홀 완료</div>
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
    </div>
  );
}
