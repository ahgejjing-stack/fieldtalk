import { useContext } from "react";
import { RoomContext } from "./RoomProvider.jsx";

/**
 * useRoom() — access the Room domain from any component.
 * Returns { room, dispatch, actions }. `room` is null until ROOM_CREATE.
 */
export function useRoom() {
  const ctx = useContext(RoomContext);
  if (!ctx) {
    throw new Error("useRoom() must be used inside <RoomProvider>");
  }
  return ctx;
}
