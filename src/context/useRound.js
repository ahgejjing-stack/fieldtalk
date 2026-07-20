import { useContext } from "react";
import { RoundContext } from "./RoundProvider.jsx";

/**
 * useRound() — access the Round Engine from any component.
 * Returns { round, dispatch, actions, meId, startPtt, stopPtt,
 *           completeCurrentHoleAndAdvance }.
 */
export function useRound() {
  const ctx = useContext(RoundContext);
  if (!ctx) {
    throw new Error("useRound() must be used inside <RoundProvider>");
  }
  return ctx;
}
