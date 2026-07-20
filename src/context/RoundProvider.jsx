import React, { createContext, useEffect, useMemo, useReducer, useRef } from "react";
import { roundReducer } from "../engine/roundReducer.js";
import * as actions from "../engine/roundActions.js";
import { loadRound, saveRound } from "../engine/roundStorage.js";
import { createRoundSeed } from "../data/roundSeed.js";
import { useIdentity } from "./useIdentity.js";

export const RoundContext = createContext(null);

function init(userId) {
  return loadRound(userId) ?? createRoundSeed();
}

export default function RoundProvider({ children }) {
  const identity = useIdentity();
  // Runtime Identity v0.4 §2/§3: `meId` now comes from the runtime
  // identity instead of the hardcoded ME_PLAYER_ID constant.
  // createRoundSeed()'s DEMO fallback is UNCHANGED (still always seeds
  // the same 4 named players, 재식 host among them) — switching identity
  // just changes whose row is "me" among that same set, which already
  // works correctly for every component (PlayerCard/ScoreCard/
  // DistanceCard/PTTButton) since none of them import ME_PLAYER_ID
  // directly — they all read `meId` from this context.
  const [round, dispatch] = useReducer(roundReducer, identity.userId, init);

  // Kept in sync every render so guarded helpers (startPTT, etc.) always see
  // the freshest state even when called from an event handler closure.
  const roundRef = useRef(round);
  useEffect(() => {
    roundRef.current = round;
  }, [round]);

  // MVP persistence: save on every change, no debounce (per TASK-003 §6).
  useEffect(() => {
    saveRound(round, identity.userId);
  }, [round, identity.userId]);

  const value = useMemo(() => {
    /**
     * Guarded PTT start: rejects synchronously (without dispatching) if
     * someone else is already speaking, so the caller can show a toast
     * immediately instead of waiting for a state round-trip. The reducer
     * itself also enforces the same rule as a backstop.
     */
    function startPtt(playerId) {
      const current = roundRef.current;
      const speaker = current.players.find(
        (p) => p.id !== playerId && p.communication.isSpeaking
      );
      if (speaker) {
        return { ok: false, speakerName: speaker.name };
      }
      dispatch(actions.pttStart(playerId));
      return { ok: true };
    }

    function stopPtt(playerId) {
      dispatch(actions.pttStop(playerId));
    }

    /** Marks the current hole complete, then advances (or completes the
     * round on hole 18) — a small convenience wrapper around the two
     * underlying actions so RoundScreen doesn't need to sequence them. */
    function completeCurrentHoleAndAdvance() {
      const current = roundRef.current;
      dispatch(actions.holeComplete(current.currentHoleNumber));
      dispatch(actions.nextHole());
    }

    return {
      round,
      dispatch,
      actions,
      meId: identity.userId,
      startPtt,
      stopPtt,
      completeCurrentHoleAndAdvance,
    };
  }, [round, identity.userId]);

  return <RoundContext.Provider value={value}>{children}</RoundContext.Provider>;
}
