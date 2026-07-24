import React, { createContext, useEffect, useMemo, useReducer, useRef } from "react";
import { roundReducer } from "../engine/roundReducer.js";
import * as actions from "../engine/roundActions.js";
import { loadRound, saveRound } from "../engine/roundStorage.js";
import { createRoundSeed, createNetworkRoundState, createIdleRoundState } from "../data/roundSeed.js";
import { decideNetworkBaseline } from "../room/decideNetworkBaseline.js";
import { useIdentity } from "./useIdentity.js";
import { useCommunication } from "./useCommunication.js";
import { useRoom } from "./useRoom.js";
import { useRuntimeMode } from "./RuntimeModeContext.jsx";

export const RoundContext = createContext(null);

function init(userId) {
  // RC4 제품 구조 수정 — 앱 시작 시 데모 라운드를 실행하지 않는다.
  // 이전에는 createRoundSeed()(round_demo_001 active, 데모 4명)가
  // 기본값이라 Room 생성 전부터 데모 라운드가 켜져 있었다.
  // 저장된 라운드가 있으면 복원하고, 없으면 idle(플레이어 0명) 상태로 둔다.
  return loadRound(userId) ?? createIdleRoundState();
}

// RC4 diagnostic — [ROUND PROVIDER STATE]: log every Round Engine
// transition with prev/next roundId·status·players.length so a device test
// shows exactly which action moved the round into (or out of) a pending /
// empty state. Wraps the pure reducer without changing its behaviour.
function loggingRoundReducer(state, action) {
  const next = roundReducer(state, action);
  // eslint-disable-next-line no-console
  console.log(
    "[ROUND PROVIDER STATE]",
    `action=${action?.type}`,
    `prev=${state?.id}/${state?.status}/${state?.players?.length ?? 0}`,
    `next=${next?.id}/${next?.status}/${next?.players?.length ?? 0}`
  );
  return next;
}

export default function RoundProvider({ children }) {
  const identity = useIdentity();
  const communication = useCommunication(); // RC4 P1 fix
  const { room } = useRoom(); // RC4 P1 defense — rejoin hole-state recovery needs to know who's host
  const { networkCommunicationEnabled } = useRuntimeMode(); // RC4 regression fix — demo/network isolation
  // Runtime Identity v0.4 §2/§3: `meId` now comes from the runtime
  // identity instead of the hardcoded ME_PLAYER_ID constant.
  // createRoundSeed()'s DEMO fallback is UNCHANGED (still always seeds
  // the same 4 named players, 재식 host among them) — switching identity
  // just changes whose row is "me" among that same set, which already
  // works correctly for every component (PlayerCard/ScoreCard/
  // DistanceCard/PTTButton) since none of them import ME_PLAYER_ID
  // directly — they all read `meId` from this context.
  const [round, dispatch] = useReducer(loggingRoundReducer, identity.userId, init);

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

  // RC4 CRITICAL REGRESSION FIX — the instant network mode engages, if the
  // Round Engine is still holding the demo seed (or any non-network state),
  // swap it for a clean, demo-free network baseline. This closes the exact
  // gap Founder testing hit: RoundProvider.init() always seeds
  // createRoundSeed() (재식·재근·광천·해란), and pressing Round Start
  // navigated to RoundScreen while that demo round was still the active
  // state — so both phones rendered demo players (and the demo speaking
  // timer fired). A render-only condition can't fix this; the demo data
  // must be removed from the actual Round state. The reducer guards against
  // clobbering a real live network round (`round_<ts>` + active), so this
  // never wipes a round that round_started already hydrated.
  useEffect(() => {
    const decision = decideNetworkBaseline({ networkCommunicationEnabled, round });
    if (decision !== "baseline") return;
    const onDemoSeed = round.id === "round_demo_001";
    // eslint-disable-next-line no-console
    console.log(
      "[ROUND MODE]",
      "mode=network",
      onDemoSeed ? "→ removing demo seed, entering clean network baseline" : "→ entering clean network baseline"
    );
    dispatch(
      actions.roundEnterNetworkBaseline(
        createNetworkRoundState({
          roomId: room?.code ?? null,
          hostUserId: room?.hostUserId ?? null,
          players: [], // roster arrives via round_started; empty is valid (loading)
        })
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [networkCommunicationEnabled, round.id]);

  // RC4 P1 fix — the receiving side of hole-advance sync. The sender
  // already applied it locally (completeCurrentHoleAndAdvance above);
  // this is what makes a TEAMMATE's hole completion actually advance
  // MY OWN Round Engine too, which never happened before this fix —
  // every device's hole progression was completely independent.
  useEffect(() => {
    const payload = communication.receivedHoleAdvance;
    if (!payload) return;
    if (roundRef.current.currentHoleNumber === payload.completedHoleNumber) {
      dispatch(actions.holeComplete(payload.completedHoleNumber));
      dispatch(actions.nextHole());
    }
    communication.clearReceivedHoleAdvance?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communication.receivedHoleAdvance]);

  // RC4 P1 defense — rejoin hole-state recovery, host side: watches
  // lastMemberOnlineEvent (fires on EVERY member_online, including a
  // reconnecting member whose userId was already known) rather than
  // communication.members.length, which was confirmed NOT to change on
  // a reconnect — the member list upserts existing entries instead of
  // growing, so a pure length-delta trigger silently never fires for
  // exactly the rejoin case this exists to handle.
  useEffect(() => {
    const event = communication.lastMemberOnlineEvent;
    if (!event) return;
    const isHost = room?.hostUserId === identity.userId;
    if (isHost) {
      communication.shareHoleSync?.({ currentHoleNumber: roundRef.current.currentHoleNumber, targetUserId: event.userId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communication.lastMemberOnlineEvent]);

  // RC4 P1 defense — rejoin hole-state recovery, guest side: catch up
  // one hole at a time via the SAME reducer path a normal advance uses
  // (holeComplete + nextHole), reusing its existing "must be completed
  // first" guard rather than introducing a new, less-tested jump path.
  // Bounded loop (18 holes max) so a corrupt/hostile payload can't spin
  // forever.
  useEffect(() => {
    const payload = communication.receivedHoleSync;
    if (!payload) return;
    const target = payload.currentHoleNumber;
    // dispatch() doesn't update roundRef.current synchronously (that only
    // happens after a re-render, via the separate ref-sync effect above),
    // so the loop can't re-check the ref between iterations — track the
    // hop count locally instead, computed once from the current value.
    let n = roundRef.current.currentHoleNumber;
    let guard = 0;
    while (n < target && guard < 18) {
      dispatch(actions.holeComplete(n));
      dispatch(actions.nextHole());
      n += 1;
      guard += 1;
    }
    communication.clearReceivedHoleSync?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communication.receivedHoleSync]);

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
      const completedHoleNumber = current.currentHoleNumber;
      dispatch(actions.holeComplete(completedHoleNumber));
      dispatch(actions.nextHole());
      // RC4 P1 fix — this was purely local before; teammates' Round
      // Engine never advanced, leaving them permanently on the old hole.
      communication.shareHoleAdvance?.({
        completedHoleNumber,
        nextHoleNumber: completedHoleNumber + 1,
      });
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
