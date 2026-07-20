import React, { useEffect, useRef } from "react";

// Row height must match the CSS (.ft-wheel-item height) exactly, since JS
// uses this to compute/scroll to digit positions.
const ITEM_HEIGHT = 36;

/** One independently-swipeable 0–9 column. Supports both touch/scroll
 * (real device use) and direct tap-to-select (works everywhere, and is
 * what makes this reliably testable). */
function DigitWheel({ digit, onChange }) {
  const listRef = useRef(null);
  const scrollTimerRef = useRef(null);
  // Guard 1: ignore scroll events caused by our *own* programmatic scrollTo
  // calls, so we don't misread them as new user input.
  const isProgrammaticScrollRef = useRef(false);
  // Guard 2: when a digit change originates from the user's own scroll
  // settling, the list is *already* sitting exactly where it needs to be —
  // re-issuing scrollTo() at that moment can fight the browser's native
  // scroll-snap while momentum is still decelerating, which was leaving the
  // visual wheel position and the actual React state out of sync (the
  // digit would *look* changed but `onChange` never committed it, so
  // anything computed from the value — like the GPS-diff warning — used a
  // stale number). Skipping the redundant scrollTo for this case fixes it.
  const skipNextSyncRef = useRef(false);

  // Keep the wheel's scroll position in sync whenever the digit changes
  // from outside (tap-to-select, or an external reset to the GPS value) —
  // but not when the change we're reacting to is our own scroll settling.
  useEffect(() => {
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }
    if (!listRef.current) return;
    isProgrammaticScrollRef.current = true;
    listRef.current.scrollTo({ top: digit * ITEM_HEIGHT, behavior: "auto" });
    // Release the guard on the next tick — just long enough to swallow the
    // scroll event this programmatic scroll itself triggers.
    const t = setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 80);
    return () => clearTimeout(t);
  }, [digit]);

  const handleScroll = () => {
    if (isProgrammaticScrollRef.current) return;
    clearTimeout(scrollTimerRef.current);
    // Debounce until the swipe/momentum settles, then commit.
    scrollTimerRef.current = setTimeout(() => {
      if (!listRef.current) return;
      const idx = Math.round(listRef.current.scrollTop / ITEM_HEIGHT);
      const clamped = Math.min(9, Math.max(0, idx));
      if (clamped !== digit) {
        skipNextSyncRef.current = true;
        onChange(clamped);
      }
    }, 140);
  };

  return (
    <div className="ft-wheel-col">
      <div className="ft-wheel-list" ref={listRef} onScroll={handleScroll}>
        <div className="ft-wheel-pad" aria-hidden="true" />
        {Array.from({ length: 10 }, (_, i) => (
          <button
            key={i}
            type="button"
            className={`ft-wheel-item ${i === digit ? "is-selected" : ""}`}
            onClick={() => onChange(i)}
            tabIndex={-1}
          >
            {i}
          </button>
        ))}
        <div className="ft-wheel-pad" aria-hidden="true" />
      </div>
    </div>
  );
}

/**
 * WheelPicker — iPhone alarm-clock style picker for a 0–999 value, as three
 * independent digit wheels (TASK-006 §2). `onChange` fires with the whole
 * combined number whenever any single digit changes.
 */
export default function WheelPicker({ value, onChange }) {
  const clamped = Math.min(999, Math.max(0, Math.round(value)));
  const digits = [
    Math.floor(clamped / 100) % 10,
    Math.floor(clamped / 10) % 10,
    clamped % 10,
  ];

  const setDigit = (index, newDigit) => {
    const next = [...digits];
    next[index] = newDigit;
    onChange(next[0] * 100 + next[1] * 10 + next[2]);
  };

  return (
    <div className="ft-wheel-picker">
      <div className="ft-wheel-highlight" aria-hidden="true" />
      <DigitWheel digit={digits[0]} onChange={(d) => setDigit(0, d)} />
      <DigitWheel digit={digits[1]} onChange={(d) => setDigit(1, d)} />
      <DigitWheel digit={digits[2]} onChange={(d) => setDigit(2, d)} />
      <span className="ft-wheel-unit">m</span>
    </div>
  );
}
