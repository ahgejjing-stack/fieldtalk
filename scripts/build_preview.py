import re, json

BASE = "/home/claude/work3/FIELDTALK/src"

def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()

def strip_module_syntax(src):
    lines = src.split("\n")
    out = []
    skipping_import = False
    for line in lines:
        stripped = line.strip()
        # RC4 P2 regression fix: an import line with a trailing inline
        # comment (`import {x} from "y.js"; // note`) does NOT end with
        # `;` as a raw string, even though it's a complete, single-line
        # import — this previously caused skip mode to activate and
        # silently swallow the ENTIRE next line (recurred 3+ times this
        # session, once deleting a const declaration that broke the
        # merged preview at runtime). Strip a trailing `// ...` comment
        # before checking for completeness.
        code_part = re.sub(r'//.*$', '', stripped).strip()
        if skipping_import:
            if code_part.endswith(";"):
                skipping_import = False
            continue
        if stripped.startswith("import "):
            if not code_part.endswith(";"):
                skipping_import = True
            continue
        if stripped.startswith("export { isDevBuild }"):
            continue
        line = line.replace("export default function", "function")
        line = re.sub(r'^export function ', 'function ', line)
        line = re.sub(r'^export const ', 'const ', line)
        line = re.sub(r'^export async function ', 'async function ', line)
        line = re.sub(r'^export class ', 'class ', line)
        line = re.sub(r'^export \* as (\w+) from.*$', '', line)
        out.append(line)
    return "\n".join(out)

def collect_lucide_icons(paths):
    icons = set()
    for p in paths:
        src = read(p)
        m = re.search(r'import\s*\{([^}]*)\}\s*from\s*"lucide-react"', src, re.S)
        if m:
            names = [n.strip() for n in m.group(1).split(",") if n.strip()]
            icons.update(names)
    return sorted(icons)

component_paths = [
    f"{BASE}/components/GolfBall.jsx",
    f"{BASE}/components/StatusBar.jsx",
    f"{BASE}/components/VoiceLevelBars.jsx",
    f"{BASE}/components/PTTButton.jsx",
    f"{BASE}/components/PlayerCard.jsx",
    f"{BASE}/components/WheelPicker.jsx",
    f"{BASE}/components/DistanceCard.jsx",
    f"{BASE}/components/SoundButton.jsx",
    f"{BASE}/components/GalleryPanel.jsx",
    f"{BASE}/components/PersonalizedCheer.jsx",
    f"{BASE}/components/ScoreCard.jsx",
    f"{BASE}/components/HomeScreen.jsx",
    f"{BASE}/components/SplashScreen.jsx",
    f"{BASE}/components/RoomOverlay.jsx",
    f"{BASE}/components/TwoDeviceTestScreen.jsx",
    f"{BASE}/components/IdentitySelectScreen.jsx",
    f"{BASE}/components/RoundScreen.jsx",
]
lucide_icons = collect_lucide_icons(component_paths)
print("collected lucide icons:", lucide_icons)

css = read(f"{BASE}/styles/app.css")
catalog_json = read(f"{BASE}/data/soundCatalog.json").strip()

seed_js = strip_module_syntax(read(f"{BASE}/data/seed.js"))
round_seed_js = strip_module_syntax(read(f"{BASE}/data/roundSeed.js"))
radio_js = strip_module_syntax(read(f"{BASE}/utils/radio.js"))
distance_format_js = strip_module_syntax(read(f"{BASE}/utils/distanceFormat.js"))
score_format_js = strip_module_syntax(read(f"{BASE}/utils/scoreFormat.js"))

round_actions_js = strip_module_syntax(read(f"{BASE}/engine/roundActions.js"))
distance_calc_js = strip_module_syntax(read(f"{BASE}/engine/distanceCalculator.js"))
round_reducer_js = strip_module_syntax(read(f"{BASE}/engine/roundReducer.js"))
round_selectors_js = strip_module_syntax(read(f"{BASE}/engine/roundSelectors.js"))
round_storage_js = strip_module_syntax(read(f"{BASE}/engine/roundStorage.js"))

# Course Reference Prototype v0.1 — order matters: geoDistance/normalizeCourse/
# testCourseData have no local deps, CourseReferenceProvider only needs the
# base class pattern, LocalJsonCourseProvider needs all three above it.
geo_distance_js = strip_module_syntax(read(f"{BASE}/course/geoDistance.js"))
normalize_course_js = strip_module_syntax(read(f"{BASE}/course/normalizeCourse.js"))
test_course_data_js = strip_module_syntax(read(f"{BASE}/course/testCourseData.js"))
course_reference_provider_js = strip_module_syntax(read(f"{BASE}/course/providers/CourseReferenceProvider.js"))
local_json_course_provider_js = strip_module_syntax(read(f"{BASE}/course/providers/LocalJsonCourseProvider.js"))

# Integration Hardening v0.2 — runtime mode config layer, second Provider,
# CourseReferenceService, and the minimal Pre-Round selection component.
runtime_mode_js = strip_module_syntax(read(f"{BASE}/config/runtimeMode.js"))
normalize_alternate_course_js = strip_module_syntax(read(f"{BASE}/course/normalizeAlternateCourse.js"))
test_alternate_course_data_js = strip_module_syntax(read(f"{BASE}/course/testAlternateCourseData.js"))
alternate_mock_course_provider_js = strip_module_syntax(read(f"{BASE}/course/providers/AlternateMockCourseProvider.js"))
course_reference_service_js = strip_module_syntax(read(f"{BASE}/course/CourseReferenceService.js"))
course_reference_service_instance_js = strip_module_syntax(read(f"{BASE}/course/courseReferenceServiceInstance.js"))
location_provider_js = strip_module_syntax(read(f"{BASE}/location/LocationProvider.js"))
mock_location_provider_js = strip_module_syntax(read(f"{BASE}/location/MockLocationProvider.js"))
browser_location_provider_js = strip_module_syntax(read(f"{BASE}/location/BrowserLocationProvider.js"))
runtime_mode_context_jsx = strip_module_syntax(read(f"{BASE}/context/RuntimeModeContext.jsx"))

# Local Media Capture Prototype v0.1 — Communication domain, independent
# of Room/Round Engine. Order: state constants, contracts, adapter
# implementation, LocalPttClient (depends on the contract + adapter
# class names being defined earlier in the flattened script), then the
# Provider/hook.
communication_state_js = strip_module_syntax(read(f"{BASE}/communication/communicationState.js"))
audio_capture_js = strip_module_syntax(read(f"{BASE}/communication/AudioCapture.js"))
browser_audio_capture_js = strip_module_syntax(read(f"{BASE}/communication/adapters/BrowserAudioCapture.js"))
ptt_client_js = strip_module_syntax(read(f"{BASE}/communication/PttClient.js"))
local_ptt_client_js = strip_module_syntax(read(f"{BASE}/communication/LocalPttClient.js"))
ptt_press_controller_js = strip_module_syntax(read(f"{BASE}/communication/PttPressController.js"))

# Two Device PTT Foundation v0.1 — network client files. Server files
# (server/) are NOT included: a Node.js WebSocket server can't run inside
# a browser artifact context at all, so the "Room 참가" flow in this
# preview will gracefully fail with a connection error (handled by the
# existing code path) unless a real signaling server is reachable.
ptt_signaling_client_js = strip_module_syntax(read(f"{BASE}/communication/PttSignalingClient.js"))
webrtc_transport_js = strip_module_syntax(read(f"{BASE}/communication/WebRtcTransport.js"))
network_ptt_client_js = strip_module_syntax(read(f"{BASE}/communication/NetworkPttClient.js"))
network_ptt_client_js = re.sub(r'\bVOICE_DETECTED_THRESHOLD\b', 'NETWORK_VOICE_DETECTED_THRESHOLD', network_ptt_client_js)
communication_mode_js = strip_module_syntax(read(f"{BASE}/config/communicationMode.js"))
two_device_test_screen_jsx = strip_module_syntax(read(f"{BASE}/components/TwoDeviceTestScreen.jsx"))
# Both this file and App.jsx independently declare `DEFAULT_SIGNALING_URL`
# with the same value — rename this file's copy to avoid a duplicate
# top-level const collision in the flattened script.
two_device_test_screen_jsx = re.sub(r'\bDEFAULT_SIGNALING_URL\b', 'TWO_DEVICE_DEFAULT_SIGNALING_URL', two_device_test_screen_jsx)
communication_provider_jsx = strip_module_syntax(read(f"{BASE}/context/CommunicationProvider.jsx"))
use_communication_js = strip_module_syntax(read(f"{BASE}/context/useCommunication.js"))

# Round Room Foundation v0.1 — Room domain, completely separate from Round
# Engine, plus the Room->Round bridge and the coordinator hook.
room_actions_js = strip_module_syntax(read(f"{BASE}/room/roomActions.js"))
room_reducer_js = strip_module_syntax(read(f"{BASE}/room/roomReducer.js"))
room_reducer_js = re.sub(r'\bnowIso\b', 'roomNowIso', room_reducer_js)

room_selectors_js = strip_module_syntax(read(f"{BASE}/room/roomSelectors.js"))
room_storage_js = strip_module_syntax(read(f"{BASE}/room/roomStorage.js"))

create_round_players_from_room_js = strip_module_syntax(read(f"{BASE}/room/createRoundPlayersFromRoom.js"))
create_round_players_from_room_js = re.sub(r'\bNOW_ISO\b', 'CREATE_PLAYERS_NOW_ISO', create_round_players_from_room_js)

build_initial_round_from_room_js = strip_module_syntax(read(f"{BASE}/room/buildInitialRoundFromRoom.js"))
build_initial_round_from_room_js = re.sub(r'\bNOW_ISO\b', 'BUILD_ROUND_NOW_ISO', build_initial_round_from_room_js)
build_initial_round_from_room_js = re.sub(r'\beventSeq\b', 'buildRoundEventSeq', build_initial_round_from_room_js)
build_initial_round_from_room_js = re.sub(r'\bmakeEventId\b', 'makeBuildRoundEventId', build_initial_round_from_room_js)

use_start_round_from_room_js = strip_module_syntax(read(f"{BASE}/room/useStartRoundFromRoom.js"))
room_provider_jsx = strip_module_syntax(read(f"{BASE}/context/RoomProvider.jsx"))
room_provider_jsx = re.sub(r'\binit\b', 'roomProviderInit', room_provider_jsx)
use_room_js = strip_module_syntax(read(f"{BASE}/context/useRoom.js"))
room_overlay_jsx = strip_module_syntax(read(f"{BASE}/components/RoomOverlay.jsx"))
# RoomOverlay.jsx declares its own top-level `const isDevMode` (Stabilization
# v0.2 §5 DEV debug display) — same collision pattern as HomeScreen.jsx's
# copy. Rename this file's copy entirely and force it false, consistent
# with this preview always showing the non-DEV experience.
room_overlay_jsx = re.sub(r'\bisDevMode\b', 'isDevModeRoomOverlay', room_overlay_jsx)
room_overlay_jsx = room_overlay_jsx.replace(
    'const isDevModeRoomOverlay = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;',
    'const isDevModeRoomOverlay = false; // this preview always shows the default (non-DEV) experience'
)

round_provider_jsx = strip_module_syntax(read(f"{BASE}/context/RoundProvider.jsx"))
action_creator_names = re.findall(r'^export const (\w+) = \(', read(f"{BASE}/engine/roundActions.js"), re.M)
actions_namespace = "const actions = {\n" + ",\n".join(f"  {n}" for n in action_creator_names) + ",\n};"

room_action_creator_names = re.findall(r'^export const (\w+) = \(', read(f"{BASE}/room/roomActions.js"), re.M)
room_actions_namespace = "const roomActions = {\n" + ",\n".join(f"  {n}" for n in room_action_creator_names) + ",\n};"
round_provider_jsx = re.sub(r'^\* as actions from.*$', '', round_provider_jsx, flags=re.M)

use_round_js = strip_module_syntax(read(f"{BASE}/context/useRound.js"))

audio_engine_js = strip_module_syntax(read(f"{BASE}/services/audioEngine.js"))
audio_engine_js = audio_engine_js.replace(
    'const CATALOG_VERSION = soundCatalogFile.version;',
    'const CATALOG_VERSION = SOUND_CATALOG_FILE.version;'
).replace(
    'const DEFAULT_COOLDOWN_MS = soundCatalogFile.defaultCooldownMs ?? 3000;',
    'const DEFAULT_COOLDOWN_MS = SOUND_CATALOG_FILE.defaultCooldownMs ?? 3000;'
).replace(
    'const soundCatalog = soundCatalogFile.sounds || [];',
    'const soundCatalog = SOUND_CATALOG_FILE.sounds || [];'
)
use_audio_engine_js = strip_module_syntax(read(f"{BASE}/hooks/useAudioEngine.js"))
use_now_tick_js = strip_module_syntax(read(f"{BASE}/hooks/useNowTick.js"))

golf_ball = strip_module_syntax(read(f"{BASE}/components/GolfBall.jsx"))
status_bar = strip_module_syntax(read(f"{BASE}/components/StatusBar.jsx"))
voice_bars = strip_module_syntax(read(f"{BASE}/components/VoiceLevelBars.jsx"))
ptt_button = strip_module_syntax(read(f"{BASE}/components/PTTButton.jsx"))
player_card = strip_module_syntax(read(f"{BASE}/components/PlayerCard.jsx"))
wheel_picker = strip_module_syntax(read(f"{BASE}/components/WheelPicker.jsx"))
distance_card = strip_module_syntax(read(f"{BASE}/components/DistanceCard.jsx"))
distance_card = distance_card.replace(
    'const isDevMode = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;',
    'const isDevMode = false; // this preview always shows the default (non-DEV) experience'
)
sound_button = strip_module_syntax(read(f"{BASE}/components/SoundButton.jsx"))
sound_button = sound_button.replace(
    'const isDevBuild =\n  typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;',
    'const isDevBuild = true; // always show rights badges in this preview'
)
gallery_panel = strip_module_syntax(read(f"{BASE}/components/GalleryPanel.jsx"))
personalized_cheer = strip_module_syntax(read(f"{BASE}/components/PersonalizedCheer.jsx"))
score_card = strip_module_syntax(read(f"{BASE}/components/ScoreCard.jsx"))
home_screen = strip_module_syntax(read(f"{BASE}/components/HomeScreen.jsx"))
# Two files each declare their own top-level `const isDevMode` — harmless in
# their real separate modules, but a duplicate-declaration error once
# flattened into one script. Rename this file's copy entirely (declaration
# + its one usage site) rather than just changing the value.
home_screen = re.sub(r'\bisDevMode\b', 'isDevModeHomeScreen', home_screen)
home_screen = home_screen.replace(
    'const isDevModeHomeScreen = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;',
    'const isDevModeHomeScreen = false; // this preview always shows the default (non-DEV) experience'
)
splash_screen = strip_module_syntax(read(f"{BASE}/components/SplashScreen.jsx"))
round_screen = strip_module_syntax(read(f"{BASE}/components/RoundScreen.jsx"))

app_js = strip_module_syntax(read(f"{BASE}/App.jsx"))

# Runtime Identity v0.4 — these files were added after this merge script was
# last updated and were completely missing from prior preview builds.
runtime_identity_js = strip_module_syntax(read(f"{BASE}/identity/runtimeIdentity.js"))
identity_storage_js = strip_module_syntax(read(f"{BASE}/identity/identityStorage.js"))
identity_provider_jsx = strip_module_syntax(read(f"{BASE}/context/IdentityProvider.jsx"))
use_identity_js = strip_module_syntax(read(f"{BASE}/context/useIdentity.js"))
identity_select_screen_jsx = strip_module_syntax(read(f"{BASE}/components/IdentitySelectScreen.jsx"))
app_js = app_js.replace("function App()", "export default function App()")

icons_import_block = "import {\n  " + ",\n  ".join(lucide_icons) + ",\n} from \"lucide-react\";"

storage_polyfill = """/* ---------------- Preview Storage Polyfill (Sprint 8.3 Root Cause Fix) ----------------
   ROOT CAUSE: Claude.ai's artifact sandbox does not support window.localStorage /
   window.sessionStorage (see this environment's own persistent_storage_for_artifacts
   guidance: "NEVER use localStorage, sessionStorage, or ANY browser storage APIs in
   artifacts. These are NOT supported and artifacts will fail in Claude.ai"). The real
   FIELDTALK source correctly uses real browser storage -- that is the right choice for
   an actual deployed PWA/mobile app, and is NOT changed here. This polyfill exists ONLY
   in this merged single-file Preview artifact: it swaps in a simple in-memory Map-backed
   storage so the exact same application code (identity/Room/Round persistence) runs
   safely inside the Preview sandbox instead of every read/write silently failing --
   which is what was making companion-invite taps (and any other state that round-trips
   through storage on the next render) appear completely unresponsive in the Founder
   Preview specifically, while working normally in a real browser. */
(function installPreviewStoragePolyfill() {
  function makeMemoryStorage() {
    const data = new Map();
    return {
      getItem(key) { return data.has(key) ? data.get(key) : null; },
      setItem(key, value) { data.set(key, String(value)); },
      removeItem(key) { data.delete(key); },
      clear() { data.clear(); },
      key(i) { return Array.from(data.keys())[i] ?? null; },
      get length() { return data.size; },
    };
  }
  const memoryLocalStorage = makeMemoryStorage();
  const memorySessionStorage = makeMemoryStorage();
  try {
    Object.defineProperty(window, "localStorage", { value: memoryLocalStorage, configurable: true, writable: true });
  } catch (err) {
    try { window.localStorage = memoryLocalStorage; } catch (err2) { /* give up silently, try/catch in app code still protects functionality */ }
  }
  try {
    Object.defineProperty(window, "sessionStorage", { value: memorySessionStorage, configurable: true, writable: true });
  } catch (err) {
    try { window.sessionStorage = memorySessionStorage; } catch (err2) { /* same */ }
  }
})();"""

pieces = [
    "import React, { useState, useEffect, useRef, useCallback, useContext, useMemo, useReducer, createContext } from \"react\";",
    icons_import_block,
    "",
    storage_polyfill,
    "",
    "/* ---------------- Sound catalog (src/data/soundCatalog.json) ---------------- */",
    f"const SOUND_CATALOG_FILE = {catalog_json};",
    "",
    "/* ---------------- src/data/seed.js ---------------- */",
    seed_js,
    "",
    "/* ---------------- src/data/roundSeed.js ---------------- */",
    round_seed_js,
    "",
    "/* ---------------- src/utils/radio.js ---------------- */",
    radio_js,
    "",
    "/* ---------------- src/utils/distanceFormat.js ---------------- */",
    distance_format_js,
    "",
    "/* ---------------- src/utils/scoreFormat.js ---------------- */",
    score_format_js,
    "",
    "/* ---------------- src/engine/roundActions.js ---------------- */",
    round_actions_js,
    actions_namespace,
    "",
    "/* ---------------- src/engine/distanceCalculator.js ---------------- */",
    distance_calc_js,
    "",
    "/* ---------------- src/engine/roundReducer.js ---------------- */",
    round_reducer_js,
    "",
    "/* ---------------- src/engine/roundSelectors.js ---------------- */",
    round_selectors_js,
    "",
    "/* ---------------- src/engine/roundStorage.js ---------------- */",
    round_storage_js,
    "",
    "/* ---------------- src/course/geoDistance.js ---------------- */",
    geo_distance_js,
    "",
    "/* ---------------- src/course/normalizeCourse.js ---------------- */",
    normalize_course_js,
    "",
    "/* ---------------- src/course/testCourseData.js ---------------- */",
    test_course_data_js,
    "",
    "/* ---------------- src/course/providers/CourseReferenceProvider.js ---------------- */",
    course_reference_provider_js,
    "",
    "/* ---------------- src/course/providers/LocalJsonCourseProvider.js ---------------- */",
    local_json_course_provider_js,
    "",
    "/* ---------------- src/config/runtimeMode.js ---------------- */",
    runtime_mode_js,
    "",
    "/* ---------------- src/course/normalizeAlternateCourse.js ---------------- */",
    normalize_alternate_course_js,
    "",
    "/* ---------------- src/course/testAlternateCourseData.js ---------------- */",
    test_alternate_course_data_js,
    "",
    "/* ---------------- src/course/providers/AlternateMockCourseProvider.js ---------------- */",
    alternate_mock_course_provider_js,
    "",
    "/* ---------------- src/course/CourseReferenceService.js ---------------- */",
    course_reference_service_js,
    "",
    "/* ---------------- src/course/courseReferenceServiceInstance.js ---------------- */",
    course_reference_service_instance_js,
    "",
    "/* ---------------- src/location/LocationProvider.js ---------------- */",
    location_provider_js,
    "",
    "/* ---------------- src/location/MockLocationProvider.js ---------------- */",
    mock_location_provider_js,
    "",
    "/* ---------------- src/location/BrowserLocationProvider.js ---------------- */",
    browser_location_provider_js,
    "",
    "/* ---------------- src/context/RuntimeModeContext.jsx ---------------- */",
    runtime_mode_context_jsx,
    "",
    "/* ---------------- src/identity/runtimeIdentity.js ---------------- */",
    runtime_identity_js,
    "",
    "/* ---------------- src/identity/identityStorage.js ---------------- */",
    identity_storage_js,
    "",
    "/* ---------------- src/context/IdentityProvider.jsx ---------------- */",
    identity_provider_jsx,
    "",
    "/* ---------------- src/context/useIdentity.js ---------------- */",
    use_identity_js,
    "",
    "/* ---------------- src/communication/communicationState.js ---------------- */",
    communication_state_js,
    "",
    "/* ---------------- src/communication/AudioCapture.js ---------------- */",
    audio_capture_js,
    "",
    "/* ---------------- src/communication/adapters/BrowserAudioCapture.js ---------------- */",
    browser_audio_capture_js,
    "",
    "/* ---------------- src/communication/PttClient.js ---------------- */",
    ptt_client_js,
    "",
    "/* ---------------- src/communication/LocalPttClient.js ---------------- */",
    local_ptt_client_js,
    "",
    "/* ---------------- src/communication/PttPressController.js ---------------- */",
    ptt_press_controller_js,
    "",
    "/* ---------------- src/config/communicationMode.js ---------------- */",
    communication_mode_js,
    "",
    "/* ---------------- src/communication/PttSignalingClient.js ---------------- */",
    ptt_signaling_client_js,
    "",
    "/* ---------------- src/communication/WebRtcTransport.js ---------------- */",
    webrtc_transport_js,
    "",
    "/* ---------------- src/communication/NetworkPttClient.js ---------------- */",
    network_ptt_client_js,
    "",
    "/* ---------------- src/context/CommunicationProvider.jsx ---------------- */",
    communication_provider_jsx,
    "",
    "/* ---------------- src/context/useCommunication.js ---------------- */",
    use_communication_js,
    "",
    "/* ---------------- src/room/roomActions.js ---------------- */",
    room_actions_js,
    room_actions_namespace,
    "",
    "/* ---------------- src/room/roomReducer.js ---------------- */",
    room_reducer_js,
    "",
    "/* ---------------- src/room/roomSelectors.js ---------------- */",
    room_selectors_js,
    "",
    "/* ---------------- src/room/roomStorage.js ---------------- */",
    room_storage_js,
    "",
    "/* ---------------- src/room/createRoundPlayersFromRoom.js ---------------- */",
    create_round_players_from_room_js,
    "",
    "/* ---------------- src/room/buildInitialRoundFromRoom.js ---------------- */",
    build_initial_round_from_room_js,
    "",
    "/* ---------------- src/context/RoomProvider.jsx ---------------- */",
    room_provider_jsx,
    "",
    "/* ---------------- src/context/useRoom.js ---------------- */",
    use_room_js,
    "",
    "/* ---------------- src/context/RoundProvider.jsx ---------------- */",
    round_provider_jsx,
    "",
    "/* ---------------- src/context/useRound.js ---------------- */",
    use_round_js,
    "",
    "/* ---------------- src/room/useStartRoundFromRoom.js ---------------- */",
    use_start_round_from_room_js,
    "",
    "/* ---------------- src/services/audioEngine.js ---------------- */",
    audio_engine_js,
    "",
    "/* ---------------- src/hooks/useAudioEngine.js ---------------- */",
    use_audio_engine_js,
    "",
    "/* ---------------- src/hooks/useNowTick.js ---------------- */",
    use_now_tick_js,
    "",
    "/* ---------------- src/components/GolfBall.jsx ---------------- */",
    golf_ball,
    "",
    "/* ---------------- src/components/StatusBar.jsx ---------------- */",
    status_bar,
    "",
    "/* ---------------- src/components/VoiceLevelBars.jsx ---------------- */",
    voice_bars,
    "",
    "/* ---------------- src/components/PTTButton.jsx ---------------- */",
    ptt_button,
    "",
    "/* ---------------- src/components/PlayerCard.jsx ---------------- */",
    player_card,
    "",
    "/* ---------------- src/components/WheelPicker.jsx ---------------- */",
    wheel_picker,
    "",
    "/* ---------------- src/components/DistanceCard.jsx ---------------- */",
    distance_card,
    "",
    "/* ---------------- src/components/SoundButton.jsx ---------------- */",
    sound_button,
    "",
    "/* ---------------- src/components/GalleryPanel.jsx ---------------- */",
    gallery_panel,
    "",
    "/* ---------------- src/components/PersonalizedCheer.jsx ---------------- */",
    personalized_cheer,
    "",
    "/* ---------------- src/components/ScoreCard.jsx ---------------- */",
    score_card,
    "",
    "/* ---------------- src/components/RoomOverlay.jsx ---------------- */",
    room_overlay_jsx,
    "",
    "/* ---------------- src/components/IdentitySelectScreen.jsx ---------------- */",
    identity_select_screen_jsx,
    "",
    "/* ---------------- src/components/TwoDeviceTestScreen.jsx ---------------- */",
    two_device_test_screen_jsx,
    "",
    "/* ---------------- src/components/HomeScreen.jsx ---------------- */",
    home_screen,
    "",
    "/* ---------------- src/components/SplashScreen.jsx ---------------- */",
    splash_screen,
    "",
    "/* ---------------- src/components/RoundScreen.jsx ---------------- */",
    round_screen,
    "",
    "/* ---------------- src/App.jsx (default export) ---------------- */",
]

body = "\n".join(pieces)

app_with_style = app_js.replace(
    'return (\n    <div className="ft-root">\n      <div className="ft-phone">',
    'return (\n    <div className="ft-root">\n      <style>{`\n' + css + '\n      `}</style>\n      <div className="ft-phone">'
)

full = body + "\n" + app_with_style + "\n"

# RC4 P2 — regression guards. Both of these bugs (an import's trailing
# comment silently deleting the next line, and a duplicate top-level
# const from two source files merging into one scope) have actually
# shipped to the delivered preview file before. Catch them here instead
# of relying on manually remembering to check every time.
dup_consts = {}
for m in re.finditer(r'^const ([A-Za-z0-9_]+)\s*=', full, re.M):
    dup_consts[m.group(1)] = dup_consts.get(m.group(1), 0) + 1
dups = {k: v for k, v in dup_consts.items() if v > 1}
if dups:
    raise SystemExit(f"REGRESSION GUARD FAILED: duplicate top-level const declarations in merged output: {dups}")

with open("/tmp/FieldTalkPreview5.jsx", "w", encoding="utf-8") as f:
    f.write(full)

# Actual syntax/reference check via esbuild, not just "no dup consts" --
# catches the ReferenceError class of bug (e.g. a declaration silently
# swallowed by the import-stripping bug) that dup-const detection alone
# would miss, since a MISSING declaration isn't a duplicate.
import subprocess
esbuild_check = subprocess.run(
    [
        "/home/claude/.npm-global/lib/node_modules/tsx/node_modules/esbuild/bin/esbuild",
        "/tmp/FieldTalkPreview5.jsx",
        "--bundle", "--jsx=automatic",
        "--external:react", "--external:react-dom", "--external:lucide-react",
        "--outfile=/tmp/.preview5_syntax_check.js", "--log-level=error",
    ],
    capture_output=True, text=True,
)
if esbuild_check.returncode != 0:
    raise SystemExit(f"REGRESSION GUARD FAILED: esbuild syntax check failed on merged output:\n{esbuild_check.stderr}")

print("done, length:", len(full))
print("regression guards passed: no duplicate consts, esbuild syntax check clean")
print("NOTE: this only catches syntax/reference errors, not runtime crashes -- a real browser smoke test (Playwright, navigate + click through) is still required before delivery.")
