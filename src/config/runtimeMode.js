/**
 * runtimeMode.js
 * ------------------------------------------------------------------
 * Course Reference Integration Hardening v0.2 §1 — "실행 모드가 Round
 * Engine의 도메인 상태로 들어갈 필요는 없다." This is a plain constants
 * module, not a reducer field. The mode itself lives in
 * RuntimeModeContext.jsx (an app-configuration-layer React Context,
 * outside RoundProvider), and travels into pure functions (selectPlayerGps,
 * etc.) as an explicit parameter — never read from a global.
 * ------------------------------------------------------------------
 */
export const RUNTIME_MODES = {
  DEMO: "demo",
  PRODUCTION: "production",
};

export const DEFAULT_RUNTIME_MODE = RUNTIME_MODES.DEMO;
