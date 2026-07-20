import { useContext } from "react";
import { CommunicationContext } from "./CommunicationProvider.jsx";

/**
 * useCommunication() — access the Communication layer from any component.
 * Returns { state, permissionStatus, isPrepared, isTransmitting,
 *           inputLevel, lastError, prepareMicrophone, startTransmit,
 *           stopTransmit, releaseMicrophone }.
 */
export function useCommunication() {
  const ctx = useContext(CommunicationContext);
  if (!ctx) {
    throw new Error("useCommunication() must be used inside <CommunicationProvider>");
  }
  return ctx;
}
