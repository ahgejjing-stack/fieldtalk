import React from "react";
import { Minus, Plus } from "lucide-react";
import { useRound } from "../context/useRound.js";
import {
  selectCurrentHole,
  selectCurrentHoleScores,
  selectPlayers,
} from "../engine/roundSelectors.js";
import { formatParRelative } from "../utils/scoreFormat.js";

const MIN_STROKES = 0;
const MAX_STROKES = 15;
function clampStrokes(v) {
  return Math.max(MIN_STROKES, Math.min(MAX_STROKES, v));
}

/**
 * Score Input UX — final model: "스코어 패널을 여는 행위가 입력 시작이다."
 *
 * There is no separate "confirm E" step anymore — that required an extra,
 * unexplained tap and didn't match how anyone actually plays. Instead:
 *   - Opening the score panel (RoundScreen.jsx's handleOpenScorePanel) is
 *     itself the start of scoring intent. If I have no real score for this
 *     hole yet, it seeds a local `draftStrokes` at `par` (E) — nothing is
 *     written to scoreByHole yet.
 *   - +/- here adjust that draft directly (no per-tap dispatch) until a
 *     real score exists, at which point they switch to live-editing the
 *     real value instead (e.g. going back to fix an earlier hole).
 *   - "홀 완료 · 다음 홀" (RoundScreen.jsx's handleCompleteHole) is the ONLY
 *     place a draft ever gets committed, via the existing playerSetScore
 *     action — E if the draft was never touched, or whatever +/- left it
 *     at. If the panel was never opened this hole, there's no draft and
 *     nothing is ever written.
 *
 * The center number is therefore just a display of "what will be saved
 * right now if I complete this hole" — not a button, nothing to tap to
 * "confirm" separately. Round Engine (`playerSetScore`, `scoreByHole`) is
 * completely unaffected by any of this.
 */
export default function ScoreCard({ draftStrokes, onDraftChange }) {
  const { round, meId, dispatch, actions } = useRound();
  const hole = selectCurrentHole(round);
  const players = selectPlayers(round);
  const scores = selectCurrentHoleScores(round);
  const par = hole ? hole.par : 4;
  const holeNumber = hole ? hole.number : round.currentHoleNumber;
  // Rule: scores are only editable before the hole is marked completed.
  const locked = hole ? hole.status === "completed" : false;

  const myRawStrokes = scores[meId]; // null = no real score yet
  const myHasScore = myRawStrokes != null;
  // What's currently "selected" for me: a real score always wins; otherwise
  // the in-progress draft (already seeded to `par` by the time this panel
  // is open); `par` itself is just a defensive fallback.
  const myEffectiveStrokes = myHasScore ? myRawStrokes : draftStrokes ?? par;
  const myParRelativeLabel = formatParRelative(myEffectiveStrokes, par);

  const handleMinus = () => {
    if (locked) return;
    if (myHasScore) {
      dispatch(actions.playerSetScore(meId, holeNumber, clampStrokes(myRawStrokes - 1)));
    } else {
      onDraftChange(clampStrokes(myEffectiveStrokes - 1));
    }
  };
  const handlePlus = () => {
    if (locked) return;
    if (myHasScore) {
      dispatch(actions.playerSetScore(meId, holeNumber, clampStrokes(myRawStrokes + 1)));
    } else {
      onDraftChange(clampStrokes(myEffectiveStrokes + 1));
    }
  };

  return (
    <div className="ft-score-card">
      {players.map((p) => {
        const rawStrokes = scores[p.id];
        const hasScore = rawStrokes != null;
        const isMe = p.id === meId;
        const parRelativeLabel = formatParRelative(rawStrokes, par);
        return (
          <div className={`ft-score-row ${isMe ? "is-me" : ""}`} key={p.id}>
            <div className="ft-avatar ft-avatar-xs" style={{ "--avatar-color": p.color }}>
              {p.name}
            </div>
            <span className="ft-score-name">{p.name}</span>
            {isMe ? (
              <div className={`ft-stepper ${locked ? "is-locked" : ""}`}>
                <button onClick={handleMinus} disabled={locked} aria-label="한 타 적게">
                  <Minus size={13} strokeWidth={2.4} />
                </button>
                <div className="ft-stepper-center">
                  <span className="ft-stepper-value">{myParRelativeLabel}</span>
                  <span className="ft-stepper-raw">{myEffectiveStrokes}타</span>
                </div>
                <button onClick={handlePlus} disabled={locked} aria-label="한 타 많게">
                  <Plus size={13} strokeWidth={2.4} />
                </button>
              </div>
            ) : hasScore ? (
              <div className="ft-score-readout">
                <span className="ft-score-static">{parRelativeLabel}</span>
                <span className="ft-score-raw">{rawStrokes}타</span>
              </div>
            ) : (
              <span className="ft-score-static is-empty">—</span>
            )}
            {!isMe && hasScore && <span className="ft-score-complete-badge">입력 완료</span>}
          </div>
        );
      })}
    </div>
  );
}
