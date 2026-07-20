import React, { createContext, useEffect, useMemo, useReducer } from "react";
import { roomReducer, createEmptyRoomState } from "../room/roomReducer.js";
import * as roomActions from "../room/roomActions.js";
import { loadRoomState, saveRoomState } from "../room/roomStorage.js";
import { useIdentity } from "./useIdentity.js";

export const RoomContext = createContext(null);

function init(userId) {
  return loadRoomState(userId) ?? createEmptyRoomState();
}

export default function RoomProvider({ children }) {
  const identity = useIdentity();
  const [roomState, dispatch] = useReducer(roomReducer, identity.userId, init);

  // Same "save on every change, no debounce" policy as RoundProvider.jsx.
  useEffect(() => {
    saveRoomState(roomState, identity.userId);
  }, [roomState, identity.userId]);

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
