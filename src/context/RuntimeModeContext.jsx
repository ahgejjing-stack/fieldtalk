/**
 * RuntimeModeContext.jsx
 * ------------------------------------------------------------------
 * Course Reference Integration Hardening v0.2 §1/§6.
 *
 * The "app configuration layer" the Sprint spec asks for: owns which
 * runtime mode is active (demo/production) and which LocationProvider
 * matches it. Lives outside RoundProvider on purpose — Round Engine
 * reducers/selectors never read this Context directly; components read
 * it and pass the relevant values through as plain function arguments or
 * action payload fields, keeping selectPlayerGps() and the reducer pure.
 * ------------------------------------------------------------------
 */
import React, { createContext, useContext, useMemo, useState } from "react";
import { RUNTIME_MODES, DEFAULT_RUNTIME_MODE } from "../config/runtimeMode.js";
import { MockLocationProvider } from "../location/MockLocationProvider.js";
import { BrowserLocationProvider } from "../location/BrowserLocationProvider.js";
import { TEST_PLAYER_LOCATIONS } from "../course/testCourseData.js";

const RuntimeModeContext = createContext({
  mode: DEFAULT_RUNTIME_MODE,
  setMode: () => {},
  locationProvider: null,
  networkCommunicationEnabled: false,
  setNetworkCommunicationEnabled: () => {},
});

export function RuntimeModeProvider({ children }) {
  const [mode, setMode] = useState(DEFAULT_RUNTIME_MODE);
  // Two Device Bidirectional Hardening v0.2 Part G — explicit opt-in,
  // default false. Without this being switched on, CommunicationBridge
  // (App.jsx) always stays in local mode regardless of Room state, so
  // the existing casual demo flow (Course Reference/Score/etc, none of
  // which need a signaling server) is completely unaffected — nobody is
  // ever auto-connected to a WebSocket server they didn't ask for.
  const [networkCommunicationEnabled, setNetworkCommunicationEnabled] = useState(false);

  // §6: Demo -> MockLocationProvider (fixed test coordinate), Production ->
  // BrowserLocationProvider (real navigator.geolocation). Components never
  // decide this themselves or call navigator.geolocation directly.
  const locationProvider = useMemo(() => {
    if (mode === RUNTIME_MODES.PRODUCTION) {
      return new BrowserLocationProvider();
    }
    return new MockLocationProvider(TEST_PLAYER_LOCATIONS.player_jaesik);
  }, [mode]);

  const value = useMemo(
    () => ({ mode, setMode, locationProvider, networkCommunicationEnabled, setNetworkCommunicationEnabled }),
    [mode, locationProvider, networkCommunicationEnabled]
  );

  return <RuntimeModeContext.Provider value={value}>{children}</RuntimeModeContext.Provider>;
}

export function useRuntimeMode() {
  return useContext(RuntimeModeContext);
}
