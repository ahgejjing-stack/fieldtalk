/**
 * useStartRoundFromRoom.js
 * ------------------------------------------------------------------
 * Round Room Foundation v0.1 §6 — Room and Round are genuinely separate
 * reducers/Contexts, so one literal dispatch can't touch both. This hook
 * is the "single explicit initializer" from the UI's point of view: a
 * component calls ONE function, `startRoundFromRoom(courseSnapshot,
 * startHoleNumber)`, and everything else — validation, building the
 * complete Round object, committing it, marking the Room in_round — is
 * sequenced here, not scattered across onClick handlers.
 *
 * Failure handling: buildInitialRoundFromRoom.js validates BEFORE this
 * hook dispatches anything, so a validation failure never leaves Room or
 * Round half-updated — nothing has been touched yet at that point. Once
 * validation passes, both dispatches are synchronous local reducer calls
 * that cannot themselves fail.
 * ------------------------------------------------------------------
 */
import { useRoom } from "../context/useRoom.js";
import { useRound } from "../context/useRound.js";
import { useIdentity } from "../context/useIdentity.js";
import { useRuntimeMode } from "../context/RuntimeModeContext.jsx";
import { buildInitialRoundFromRoom } from "./buildInitialRoundFromRoom.js";

export function useStartRoundFromRoom() {
  const { room, dispatch: roomDispatch, actions: roomActions } = useRoom();
  const { dispatch: roundDispatch, actions: roundActions } = useRound();
  const identity = useIdentity();
  // RC4 P0-1 — the host must build a network round with the demo filter on
  // whenever network mode is engaged, so a DEV companion that got toggled
  // into the local room never becomes a real Round Player.
  const { networkCommunicationEnabled } = useRuntimeMode();

  /**
   * @returns {{ ok: true } | { ok: false, reason: string }}
   */
  function startRoundFromRoom(courseSnapshot, startHoleNumber) {
    if (!room) {
      return { ok: false, reason: "room_not_created" };
    }

    const result = buildInitialRoundFromRoom({
      roomMembers: room.members,
      courseSnapshot,
      startHoleNumber,
      networkMode: !!networkCommunicationEnabled,
      localUserId: identity.userId,
      localDisplayName: identity.displayName,
    });
    if (!result.ok) {
      return result;
    }

    roundDispatch(roundActions.roundStartFromRoom(result.round));
    roomDispatch(roomActions.roomMarkInRound());
    return { ok: true, round: result.round };
  }

  return { startRoundFromRoom };
}
