import React, { useEffect, useState } from "react";

// Small, fixed per-bar multipliers so bars aren't perfectly identical
// even though they all derive from the ONE real input level — purely a
// visual texture choice, never a substitute for the real signal. Chosen
// once, not randomized per-frame (that would reintroduce the same
// "fabricated variation" problem this Sprint removes).
const BAR_VARIATION = [0.75, 0.95, 1.1, 1.0, 0.85, 1.05, 0.8];

// §5 Voice Level Truthfulness — three visually distinct tiers so
// "off"/"listening but quiet"/"actual voice" are never confused with each
// other:
//   - inactive: 완전히 비활성 (near-flat, reads as "off")
//   - active + silence: 낮은 고정 기준선 (clearly "on" but not reacting)
//   - active + detected: scales with the real level
const INACTIVE_HEIGHT = 0.06;
const SILENCE_BASELINE = 0.16;

/** Renders `count` bars whose height reflects a single real audio input
 * level (0.0–1.0, from CommunicationProvider's inputLevel) — this
 * component has no idea where that number comes from and never
 * generates its own via Math.random(). `voiceDetected` (also from
 * CommunicationProvider, a DEV/visual-only threshold — never a
 * transmission gate) decides whether bars sit at the silence baseline or
 * actually scale with `level`. */
export default function VoiceLevelBars({ active, level = 0, voiceDetected = false, count = 7 }) {
  const [displayLevel, setDisplayLevel] = useState(0);

  useEffect(() => {
    setDisplayLevel(active && voiceDetected ? level : 0);
  }, [active, voiceDetected, level]);

  return (
    <div className={`ft-voice-meter ${active ? "is-active" : ""}`}>
      {Array.from({ length: count }, (_, i) => {
        const variation = BAR_VARIATION[i % BAR_VARIATION.length];
        let scaled;
        if (!active) {
          scaled = INACTIVE_HEIGHT;
        } else if (voiceDetected) {
          scaled = Math.min(1, 0.18 + displayLevel * variation);
        } else {
          scaled = SILENCE_BASELINE * variation;
        }
        return <span key={i} style={{ transform: `scaleY(${scaled})` }} />;
      })}
    </div>
  );
}


