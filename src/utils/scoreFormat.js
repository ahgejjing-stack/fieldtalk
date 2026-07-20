/**
 * scoreFormat.js
 * ------------------------------------------------------------------
 * Score Input UX — PAR-relative display. Round Engine and scoreByHole
 * keep storing raw strokes unchanged; this is purely a presentation-layer
 * transform, reused by both ScoreCard.jsx (the stepper itself) and
 * RoundScreen.jsx (the collapsed summary row) so the E/+N/-N formatting
 * rule only lives in one place.
 * ------------------------------------------------------------------
 */

/** strokes - par -> "E" | "+N" | "-N". Returns null for an unentered score
 * (strokes null/undefined) — callers should render "—"/"미입력" themselves
 * rather than treating null as a fabricated "E". */
export function formatParRelative(strokes, par) {
  if (strokes == null || typeof par !== "number") return null;
  const diff = strokes - par;
  if (diff === 0) return "E";
  return diff > 0 ? `+${diff}` : `${diff}`;
}
