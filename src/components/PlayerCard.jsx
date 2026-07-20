import React from "react";
import { Mic } from "lucide-react";

/**
 * PlayerCard — Sprint 2 "Player First UI" + Sprint 3 "Player Row = Selection".
 *
 * Design principle from Product Review: a golfer doesn't think "let me
 * check 동반자 GPS" and separately "let me check 참가자 상태" — they think
 * "지금 재근이는 어디 있지?". So this is ONE row per player, not two
 * sections. Line 1 answers "누가, 얼마나": name + distance, the two things
 * that need to be read fastest. Line 2 is everything else, small: source
 * of that distance (GPS/실측/추정/공통 참고값 — info you can *only* get
 * from the app), or a transient app-only event (말하는 중/연결 끊김/실측
 * 공유/리액션) when one is active. Eye-visible activity ("Ready"/"Walking"/
 * "Waiting") is intentionally never in this data at all — that principle
 * was already established in TASK-007 and nothing here reverses it.
 *
 * Sprint 3: the small per-row icon used to be an independent mute toggle.
 * Product Director's direction repurposes that same visual slot into a PTT
 * target-selection indicator, and — more importantly — makes the ENTIRE
 * row the tap target (not just the icon), since a small icon is too hard
 * to hit accurately in the field. Tapping "me" does nothing (`isSelectable`
 * is false for that row) since you can't address yourself.
 *
 * 거리 표시 정책 보완: `secondaryGpsLabel` (from selectPlayerSummary()) is
 * rendered on the right side of line 2, not merged into the primary number
 * — "앱이 하나의 값을 강제로 선택하게 하지 않고, 사용자가 두 값을 비교할 수
 * 있어야 한다". It's hidden whenever a transient cardEvent has taken over
 * line 2, since that's a different, higher-priority thing to communicate
 * in that moment.
 *
 * IMPORTANT — this component is still deliberately "dumb": it takes a
 * `summary` object (the exact shape `selectPlayerSummary()` returns) as a
 * prop instead of calling useRound()/useNowTick() itself, and now also
 * takes plain `isSelectable`/`isSelected`/`onToggleSelect` props instead of
 * owning any selection state itself. All of that (the target `Set`, the
 * toggle rules, the "전체" pseudo-target) lives in RoundScreen.jsx. This
 * keeps the exact same Watch-reuse property Sprint 2 established: a future
 * Watch layout can reuse the identical selection state/rules with a
 * different renderer (e.g. one row at a time) without duplicating any
 * "what does selecting this player mean" logic.
 */
export default function PlayerCard({ summary, isMe, isSelectable, isSelected, onToggleSelect }) {
  if (!summary) return null;

  const { name, color, isSpeaking, distanceM, distanceCategory, distanceLine, secondaryGpsLabel, cardEvent } = summary;

  // Priority: speaking/disconnected/recent-event (cardEvent, already
  // priority-ordered by selectPlayerCardEvent) > the normal distance line.
  const eventAccentClass =
    cardEvent?.type === "speaking"
      ? "is-live"
      : cardEvent?.type === "disconnected"
      ? "is-disconnected"
      : cardEvent?.type === "distance_shared"
      ? "is-distance-flash"
      : cardEvent?.type === "sound_reaction"
      ? "is-cheer-flash"
      : "";

  const line2Text = cardEvent ? `${cardEvent.icon} ${cardEvent.label}` : distanceLine;
  const line2Category = cardEvent ? cardEvent.type : distanceCategory;
  // Never show the secondary GPS alongside a transient event bubble — the
  // event is the more important thing to communicate in that instant.
  const showSecondaryGps = !cardEvent && !!secondaryGpsLabel;

  // Sprint 3 §2: selection has to be unmistakable "from across the room" —
  // combine several simultaneous changes (background, left border, name
  // color, distance color, icon), not just one.
  const rowClassName = `ft-player-row ${eventAccentClass} ${isSelected ? "is-selected" : ""}`;

  const content = (
    <>
      <div className="ft-player-row-avatar" style={{ "--avatar-color": color }}>
        {name}
        {isSpeaking && <span className="ft-live-ring" />}
      </div>

      <div className="ft-player-row-main">
        <div className="ft-player-row-line1">
          <span className="ft-player-row-name">
            {name}
            {isMe && " (나)"}
          </span>
          <span className={`ft-player-row-distance ${line2Category ? `is-${line2Category}` : ""}`}>
            {distanceM != null ? `${distanceM}m` : "-"}
          </span>
        </div>
        <div className="ft-player-row-line2-row">
          <span className={`ft-player-row-line2 ${line2Category ? `is-${line2Category}` : ""}`}>
            {line2Text ?? "\u00A0"}
          </span>
          {showSecondaryGps && <span className="ft-player-row-secondary-gps">{secondaryGpsLabel}</span>}
        </div>
      </div>

      {isSelectable && (
        <span className={`ft-player-row-target-icon ${isSelected ? "is-selected" : ""}`}>
          <Mic size={13} strokeWidth={2.4} />
        </span>
      )}
    </>
  );

  if (!isSelectable) {
    // "나" — informational only, not a PTT target, so it's not a button at
    // all (no press feedback, no click handler).
    return <div className={rowClassName}>{content}</div>;
  }

  return (
    <button
      type="button"
      className={rowClassName}
      onClick={onToggleSelect}
      aria-pressed={isSelected}
      aria-label={`${name}${isSelected ? " 선택 해제" : " PTT 대상으로 선택"}`}
    >
      {content}
    </button>
  );
}
