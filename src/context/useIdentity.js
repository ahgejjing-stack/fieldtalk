import { useContext } from "react";
import { IdentityContext } from "./IdentityProvider.jsx";

/**
 * useIdentity() — { userId, displayName, deviceSessionId, setIdentity,
 * demoIdentities }. Replaces direct `ME_PLAYER_ID` imports.
 */
export function useIdentity() {
  const ctx = useContext(IdentityContext);
  if (!ctx) {
    throw new Error("useIdentity() must be used inside <IdentityProvider>");
  }
  return ctx;
}
