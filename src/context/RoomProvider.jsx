import React, { createContext, useMemo, useReducer } from "react";
import { roomReducer, createEmptyRoomState } from "../room/roomReducer.js";
import * as roomActions from "../room/roomActions.js";
import { useIdentity } from "./useIdentity.js";

export const RoomContext = createContext(null);

// RC4 Session Recovery Revision — startup no longer restores the old full
// room (that caused stale room.members to appear as current participants),
// but it also no longer DESTROYS anything on launch. The live Room is
// created explicitly ("팀 연결") or rebuilt from the server on rejoin via
// the activeRoomRef flow (see App.jsx / HomeScreen "진행 중인 라운드"
// card). A cold start therefore begins with an empty in-memory Room; the
// separate, minimal activeRoomRef (roomId/userId/roundId/...) is what
// survives a restart and offers [계속하기]. RoomProvider deliberately does
// NOT touch activeRoomRef — "Do not delete an active-room reference solely
// because the app restarted."
function init() {
  return createEmptyRoomState();
}

export default function RoomProvider({ children }) {
  const identity = useIdentity();
  const [roomState, dispatch] = useReducer(roomReducer, identity.userId, init);

  const value = useMemo(
    () => ({
      room: roomState.room,
      dispatch,
      actions: roomActions,
    }),
    [roomState]
  );

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}
