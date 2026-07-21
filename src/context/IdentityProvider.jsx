import React, { createContext, useContext, useMemo, useState } from "react";
import {
  DEMO_IDENTITIES,
  DEFAULT_IDENTITY_USER_ID,
  findDemoIdentity,
  makeDeviceSessionId,
} from "../identity/runtimeIdentity.js";
import {
  loadIdentity,
  saveIdentity,
  loadOrCreateDeviceSessionId,
  clearDeviceSessionForNewIdentity,
} from "../identity/identityStorage.js";

const IdentityContext = createContext(null);

function resolveInitialIdentity() {
  const stored = loadIdentity();
  if (stored) return stored;
  const fallback = findDemoIdentity(DEFAULT_IDENTITY_USER_ID);
  return { userId: fallback.userId, displayName: fallback.displayName };
}

/**
 * IdentityProvider — Runtime Identity & Main-to-Main PTT Integration v0.4
 * §2/§3. Sits above RoomProvider/CommunicationProvider/RoundProvider so
 * all three can read the SAME identity instead of each assuming
 * ME_PLAYER_ID.
 *
 * Deliberately NOT reactive to identity changes mid-session — switching
 * identity (`setIdentity`) persists the new choice and reloads the page.
 * RoundProvider/RoomProvider's `useReducer` lazy-init only runs once per
 * mount, and this project's CommunicationProvider Sprint already hit (and
 * had to fix) real bugs from key-based remounting a Provider that wraps
 * app-level screen-navigation state — a full reload sidesteps that whole
 * class of bug for a DEV-only, infrequent action.
 */
export function IdentityProvider({ children }) {
  const [identity] = useState(resolveInitialIdentity);
  const [hasStoredIdentity] = useState(() => !!loadIdentity());
  const [deviceSessionId] = useState(() => loadOrCreateDeviceSessionId(() => makeDeviceSessionId(identity.userId)));

  const setIdentity = (userId, displayName) => {
    saveIdentity({ userId, displayName });
    clearDeviceSessionForNewIdentity(); // §4: a new identity gets a fresh session, never reuses the old tab's session id
    if (typeof window !== "undefined") window.location.reload();
  };

  const value = useMemo(
    () => ({
      userId: identity.userId,
      displayName: identity.displayName,
      deviceSessionId,
      setIdentity,
      demoIdentities: DEMO_IDENTITIES,
      hasStoredIdentity, // RC2 real-person-joining fix — see NameEntryGate.jsx
    }),
    [identity, deviceSessionId, hasStoredIdentity]
  );

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

export { IdentityContext };
