import React, { useEffect, useRef, useState } from "react";
import { Mic, Pencil, Radio, Wind } from "lucide-react";
import { useRound } from "../context/useRound.js";
import { calculateTeamDistances, canApplyPositionCorrection } from "../engine/distanceCalculator.js";
import { selectCurrentHole, selectGreenSelection, selectPinLocationStatus, selectPlayerGps } from "../engine/roundSelectors.js";
import {
  formatRelativeTime,
  getGpsDiffWarning,
} from "../utils/distanceFormat.js";
import { speakText } from "../services/audioEngine.js";
import WheelPicker from "./WheelPicker.jsx";
import { courseReferenceService, courseProviderA, courseProviderB } from "../course/courseReferenceServiceInstance.js";
import { TEST_PLAYER_LOCATIONS } from "../course/testCourseData.js";
import { useRuntimeMode } from "../context/RuntimeModeContext.jsx";
import { RUNTIME_MODES } from "../config/runtimeMode.js";
import { useCommunication } from "../context/useCommunication.js";

// Sprint 5.2 — Information Hierarchy: wind moved out of the header (a
// standalone line competing with hole/par/score) into the same visual
// cluster as distance, since wind is "정보 that a golfer reads together
// with distance when deciding a club" — not a separate fact. No new text
// label ("바람") is added; the Wind icon itself rotates to the actual
// wind direction (continuous, not snapped to 8 arrow glyphs) so the icon
// carries real directional meaning rather than decorating a number.
const COMPASS_POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
function describeWindCompass(directionDeg) {
  const idx = Math.round((((directionDeg % 360) + 360) % 360) / 45) % 8;
  return COMPASS_POINTS[idx];
}

// Sprint 3 추가 수정 §1: 필드 소음·오인식 문제로 음성 입력을 MVP 메인 화면에서
// 숨긴다. 코드 자체(captureVoiceDistance/handleVoiceInput, isListening 상태,
// Web Speech API 연동)는 전혀 삭제하지 않았다 — 이 플래그를 true로 되돌리면
// 즉시 다시 노출되는 구조. Round Engine이나 실측 입력 로직도 무관하게 유지.
const EXPERIMENTAL_VOICE_INPUT_ENABLED = false;

// TASK-008 §2 (kept): distance sharing is an *exception* feature — only
// offered once the measured value actually differs from the GPS reference.
const SHARE_DIFF_THRESHOLD_M = 1;
const SEND_LOCK_MS = 500;
const VOICE_TIMEOUT_MS = 4000;
const EDIT_IDLE_TIMEOUT_MS = 3000;
const RETURN_TO_PTT_DELAY_MS = 550;

// Prototype/dev-only control — real users never pick these directly.
const isDevMode = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;

const GREEN_SELECTION_LABELS = {
  single: "단일",
  left: "좌그린",
  right: "우그린",
  unknown: "모름",
};

const PIN_TIER_OPTIONS = [
  { tier: "unknown", label: "모름", internalValue: "unknown" },
  { tier: "bearing_known", label: "예상", internalValue: "bearing_known" },
  { tier: "coordinate_known", label: "정확", internalValue: "coordinate_known" },
];

function locationStatusToTier(locationStatus) {
  if (locationStatus === "bearing_known") return "bearing_known";
  if (locationStatus === "coordinate_known") return "coordinate_known";
  return "unknown";
}

function formatSignedDiff(diff) {
  const rounded = Math.round(diff);
  if (rounded > 0) return `+${rounded}m`;
  if (rounded < 0) return `${rounded}m`;
  return "0m";
}

export default function DistanceCard({ onToast }) {
  const { round, meId, dispatch, actions } = useRound();
  const { mode: runtimeMode, setMode: setRuntimeMode, locationProvider } = useRuntimeMode();
  const communication = useCommunication(); // RC1 Networking Recovery
  const me = round.players.find((p) => p.id === meId);
  const hole = selectCurrentHole(round);
  const greenSelection = selectGreenSelection(round);
  const pinLocationStatus = selectPinLocationStatus(round);
  const canCorrect = canApplyPositionCorrection(pinLocationStatus);
  const activeTier = locationStatusToTier(pinLocationStatus);

  const myGps = selectPlayerGps(round, meId, { runtimeMode });
  const gpsValueM = typeof myGps?.valueM === "number" ? myGps.valueM : null;
  const hasRealCourseGps = !!(round.courseSnapshot && round.courseSnapshot.dataLevel >= 2 && me?.location);
  // Course Reference Prototype §9: three label states, no "Level 2" jargon
  // shown to real users — that stays in the small DEV badge (§9 요청).
  const gpsTagLabel =
    gpsValueM == null ? "위치 정보 없음" : hasRealCourseGps ? "GPS (참고) · Green Center 기준" : "GPS (참고)";

  const lastShare = round.lastDistanceShare ?? null;
  // 거리 표시 정책 보완 §예외 4: keep this in sync with the same
  // hole-freshness guard selectPlayerSummary() uses — a share from a
  // previous hole shouldn't leave a stale "현재 팀 기준" bar behind after
  // the Player Summary panel below has already reverted to GPS-only.
  const hasShare = !!lastShare && lastShare.holeNumber === round.currentHoleNumber;
  // TASK-010 Review §1: "내가 135m라고 보냈는데 왜 화면은 136m지?" — when
  // I'm the person whose measurement is the team's current reference for
  // this hole, my own primary display should show that real number, not
  // GPS. GPS doesn't disappear — it moves to a small secondary line below,
  // same visual pattern as the wind row.
  const isMyOwnShare = hasShare && lastShare.referencePlayerId === meId;
  const primaryTag = isMyOwnShare ? "실측" : gpsTagLabel;
  const primaryValueM = isMyOwnShare ? lastShare.referenceDistanceM : gpsValueM;

  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState(gpsValueM ?? 132);
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [flash, setFlash] = useState(false);
  const sendLockRef = useRef(false);
  const idleTimerRef = useRef(null);

  useEffect(() => () => clearTimeout(idleTimerRef.current), []);

  const clearIdleTimer = () => {
    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
  };

  const closeEditing = () => {
    clearIdleTimer();
    setIsEditing(false);
  };

  const resetIdleTimer = () => {
    clearIdleTimer();
    idleTimerRef.current = setTimeout(closeEditing, EDIT_IDLE_TIMEOUT_MS);
  };

  // TASK-009 §2: the ONLY way to open editing is this explicit action —
  // GPS itself is read-only and does nothing when tapped.
  const openEditing = () => {
    setLocalValue(gpsValueM ?? 132);
    setIsEditing(true);
    resetIdleTimer();
  };

  const returnToPtt = (delay = RETURN_TO_PTT_DELAY_MS) => {
    setTimeout(() => {
      document.querySelector(".ft-ptt-zone")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, delay);
  };

  const lastSeenSharedAt = useRef(lastShare?.sharedAt ?? null);
  useEffect(() => {
    const sharedAt = lastShare?.sharedAt ?? null;
    if (sharedAt && sharedAt !== lastSeenSharedAt.current) {
      lastSeenSharedAt.current = sharedAt;
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 400);
      return () => clearTimeout(t);
    }
    lastSeenSharedAt.current = sharedAt;
  }, [lastShare?.sharedAt]);

  // TASK-009 §3: recomputed on every render from the live localValue, so
  // the diff readout updates immediately as the wheel changes — no separate
  // "did it change" tracking needed.
  // P0-4 fix: with NO GPS baseline at all (gpsValueM == null), there's
  // nothing to compare against — any entered value is new, real
  // information and should always be shareable. The old `diff = 0`
  // fallback made showShareButton permanently false whenever GPS never
  // got a fix, silently turning every tap into a no-op "확인 완료" no
  // matter what the person entered.
  const diff = gpsValueM != null ? localValue - gpsValueM : null;
  const absDiff = diff != null ? Math.abs(diff) : null;
  const showShareButton = gpsValueM == null ? true : absDiff >= SHARE_DIFF_THRESHOLD_M;
  const diffLabel = gpsValueM == null ? "" : absDiff < SHARE_DIFF_THRESHOLD_M ? "GPS와 동일" : `GPS 대비 ${formatSignedDiff(diff)}`;
  const warningText = getGpsDiffWarning(gpsValueM, localValue);

  const performSend = (value, source) => {
    if (sendLockRef.current) return;
    if (gpsValueM != null && Math.abs(value - gpsValueM) < SHARE_DIFF_THRESHOLD_M) return;

    const calc = calculateTeamDistances({
      players: round.players,
      referencePlayerId: meId,
      referenceDistanceM: value,
      pinLocationStatus,
    });
    if (!calc.ok) {
      if (onToast) onToast("올바른 거리를 입력해주세요");
      return;
    }

    sendLockRef.current = true;
    setIsSending(true);
    dispatch(
      actions.teamDistanceShare({
        referencePlayerId: meId,
        referenceDistanceM: value,
        source,
        runtimeMode,
      })
    );
    // RC1 Networking Recovery — this was the missing piece: the dispatch
    // above only ever updated MY OWN local state. Teammates never
    // actually received a share until this line existed.
    communication.shareDistance?.({
      referenceDistanceM: value,
      source,
      holeNumber: round.currentHoleNumber,
    });
    const meName = me?.name ?? "나";
    if (onToast) onToast(`${meName} 기준 ${calc.referenceDistanceM}m를 팀에 전송했습니다.`);
    speakText("팀원에게 거리를 공유했습니다.", { language: "ko-KR" });

    closeEditing();
    setTimeout(() => {
      sendLockRef.current = false;
      setIsSending(false);
    }, SEND_LOCK_MS);
    returnToPtt();
  };

  // TASK-009 §4: same rule as TASK-008, restated with the new button
  // wording — "확인 완료" (nothing to share) vs "팀에 공유" (explicit).
  const handlePrimaryButton = () => {
    if (showShareButton) {
      performSend(localValue, "manual");
    } else {
      closeEditing();
    }
  };

  const captureVoiceDistance = (onRecognized) => {
    const SpeechRecognitionCtor =
      typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SpeechRecognitionCtor) {
      if (onToast) onToast("이 브라우저는 음성 입력을 지원하지 않아요");
      return;
    }
    try {
      const recognition = new SpeechRecognitionCtor();
      recognition.lang = "ko-KR";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      let settled = false;
      const finish = () => {
        settled = true;
        setIsListening(false);
      };
      const timeoutId = setTimeout(() => {
        if (settled) return;
        try {
          recognition.stop();
        } catch (err) {
          /* ignore */
        }
      }, VOICE_TIMEOUT_MS);

      recognition.onresult = (event) => {
        clearTimeout(timeoutId);
        const transcript = event?.results?.[0]?.[0]?.transcript || "";
        const digits = transcript.match(/\d+/g);
        const parsed = digits ? parseInt(digits.join(""), 10) : NaN;
        if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 1000) {
          onRecognized(parsed);
        } else if (onToast) {
          onToast("숫자를 인식하지 못했어요, 다시 시도해주세요");
        }
        finish();
      };
      recognition.onerror = () => {
        clearTimeout(timeoutId);
        if (onToast) onToast("음성 인식에 실패했어요");
        finish();
      };
      recognition.onend = () => {
        clearTimeout(timeoutId);
        finish();
      };

      setIsListening(true);
      recognition.start();
    } catch (err) {
      setIsListening(false);
      if (onToast) onToast("음성 입력을 시작할 수 없어요");
    }
  };

  // TASK-008 §3 (kept): voice never auto-shares. Same as GPS -> just say so
  // and return to PTT. Different -> show the diff and wait for an explicit tap.
  const handleVoiceInput = () => {
    captureVoiceDistance((parsed) => {
      setLocalValue(parsed);
      const isSameAsGps = gpsValueM != null && Math.abs(parsed - gpsValueM) < SHARE_DIFF_THRESHOLD_M;
      if (isSameAsGps) {
        closeEditing();
        if (onToast) onToast("GPS 거리와 동일합니다.");
        returnToPtt(300);
      } else {
        setIsEditing(true);
        resetIdleTimer();
        if (onToast) onToast(`음성으로 ${parsed}m를 인식했어요`);
      }
    });
  };

  const handleSetGreenSelection = (value) => {
    if (!hole) return;
    dispatch(actions.holeSetGreenSelection(hole.number, value));
  };

  const handleSetPinLocationStatus = (internalValue) => {
    if (!hole) return;
    dispatch(actions.holeSetPinLocationStatus(hole.number, internalValue));
  };

  // Course Reference Prototype §7/§9, Hardening v0.2 §3 — DEV-only: applies
  // a Level-2 test CourseReference as this Round's snapshot via the shared
  // CourseReferenceService (never a directly-constructed Provider), and
  // seeds all 4 players' TEST_PLAYER_LOCATIONS so Scenario A (각 플레이어
  // GPS가 실제 좌표로 다르게 계산됨) is reachable through the UI without a
  // real Room/Realtime layer.
  const handleApplyTestCourse = async (providerChoice) => {
    courseReferenceService.setProvider(providerChoice === "B" ? courseProviderB : courseProviderA);
    const courses = await courseReferenceService.listAvailableCourses();
    const courseReference = courses[0] ?? null;
    dispatch(actions.courseSnapshotApplied(courseReference));
    for (const [playerId, coord] of Object.entries(TEST_PLAYER_LOCATIONS)) {
      dispatch(actions.playerSetLocation(playerId, coord.latitude, coord.longitude));
    }
    onToast(`테스트 코스(Provider ${providerChoice}, Level 2)를 적용했습니다`);
  };

  const handleClearTestCourse = () => {
    dispatch(actions.courseSnapshotApplied(null));
    onToast("코스 참조를 해제했습니다 (기존 mock GPS로 복귀)");
  };

  // Hardening v0.2 §6 — demonstrates the Runtime LocationProvider
  // injection concretely: in Demo mode this resolves instantly via
  // MockLocationProvider's fixed coordinate; in Production mode it goes
  // through BrowserLocationProvider's real navigator.geolocation call.
  // Either way this component never touches navigator.geolocation itself.
  const handleGetMyLocation = async () => {
    const coord = await locationProvider.getCurrentPosition();
    if (!coord) {
      onToast("위치를 가져올 수 없습니다 (권한 거부 또는 사용 불가)");
      return;
    }
    dispatch(actions.playerSetLocation(meId, coord.latitude, coord.longitude));
    onToast("내 위치를 갱신했습니다");
  };

  const referencePlayerName = hasShare
    ? round.players.find((p) => p.id === lastShare.referencePlayerId)?.name ?? "팀원"
    : null;
  const referenceTimeLabel = hasShare ? formatRelativeTime(lastShare.sharedAt) : null;

  return (
    <div className="ft-distance-card">
      {/* Sprint 3 추가 수정 §2: GPS 숫자와 실측 입력 버튼을 같은 가로 라인에
          배치 — 이전엔 세로로 쌓여 있던 것을 합쳐 카드 높이를 줄였다. */}
      {!isEditing && (
        <div className="ft-gps-row-compact">
          <div className="ft-gps-section">
            <span className="ft-gps-tag">{primaryTag}</span>
            <span className="ft-gps-value-big">{primaryValueM != null ? `${primaryValueM}m` : "-"}</span>
            {isMyOwnShare && gpsValueM != null && (
              <span className="ft-environment-row">{gpsTagLabel} {gpsValueM}m</span>
            )}
            {hole?.wind && typeof hole.wind.directionDeg === "number" && typeof hole.wind.speedMps === "number" && (
              <span className="ft-environment-row">
                <Wind size={12} strokeWidth={2.4} style={{ transform: `rotate(${hole.wind.directionDeg}deg)` }} />
                {describeWindCompass(hole.wind.directionDeg)} {hole.wind.speedMps}m/s
              </span>
            )}
          </div>
          <button type="button" className="ft-distance-entry-btn-compact" onClick={openEditing}>
            <Pencil size={13} strokeWidth={2.2} />
            실측 입력
          </button>
        </div>
      )}
      {isEditing && (
        <div className="ft-gps-section">
          <span className="ft-gps-tag">{gpsTagLabel}</span>
          <span className="ft-gps-value-big">{gpsValueM != null ? `${gpsValueM}m` : "-"}</span>
        </div>
      )}

      {/* §1: 음성 입력은 MVP 메인 화면에서 숨김 — Experimental 플래그로만 분리,
          아래 로직(captureVoiceDistance/handleVoiceInput)은 그대로 보존됨. */}
      {EXPERIMENTAL_VOICE_INPUT_ENABLED && !isEditing && (
        <div className="ft-distance-entry-row">
          <button
            type="button"
            className="ft-voice-entry-btn"
            onClick={handleVoiceInput}
            aria-label="음성 입력"
          >
            <Mic size={16} strokeWidth={2.2} />
            {isListening && <span className="ft-voice-mini-pulse" />}
            음성 입력
          </button>
        </div>
      )}

      {isEditing && (
        <div className="ft-wheel-modal">
          <div className="ft-measured-readout">
            <span className="ft-measured-tag">실측</span>
            <span className="ft-measured-value">{localValue}m</span>
          </div>
          <WheelPicker
            value={localValue}
            onChange={(v) => {
              setLocalValue(v);
              resetIdleTimer();
            }}
          />
          {diffLabel && <p className="ft-distance-diff">{diffLabel}</p>}
          {warningText && <p className="ft-distance-warning">{warningText}</p>}
          <button
            type="button"
            className={`ft-wheel-done-btn ${showShareButton ? "" : "is-neutral"}`}
            onClick={handlePrimaryButton}
            disabled={isSending}
          >
            {showShareButton ? (
              <>
                <Radio size={14} strokeWidth={2.2} /> 팀에 공유
              </>
            ) : (
              "확인 완료"
            )}
          </button>
        </div>
      )}

      {isDevMode && (
        <div className="ft-dev-pin-controls">
          <div className="ft-pin-position-row">
            <span className="ft-pin-position-label">
              Runtime Mode <span className="ft-dev-badge">DEV</span>
            </span>
            <div className="ft-pin-position-pills">
              <button
                className={`ft-pin-pill ${runtimeMode === RUNTIME_MODES.DEMO ? "is-active" : ""}`}
                onClick={() => setRuntimeMode(RUNTIME_MODES.DEMO)}
              >
                Demo
              </button>
              <button
                className={`ft-pin-pill ${runtimeMode === RUNTIME_MODES.PRODUCTION ? "is-active" : ""}`}
                onClick={() => setRuntimeMode(RUNTIME_MODES.PRODUCTION)}
              >
                Production
              </button>
            </div>
          </div>
          <p className="ft-pin-position-hint">
            {runtimeMode === RUNTIME_MODES.PRODUCTION
              ? "Production: 실제 좌표가 없으면 GPS를 절대 표시하지 않습니다(mock 폴백 없음)."
              : "Demo: 실제 좌표가 없으면 기존 mock GPS로 폴백합니다."}
          </p>

          <div className="ft-pin-position-row">
            <span className="ft-pin-position-label">
              Course Reference{" "}
              <span className="ft-dev-badge">
                DEV{round.courseSnapshot ? ` · Level ${round.courseSnapshot.dataLevel} · ${round.courseSnapshot.source}` : ""}
              </span>
            </span>
            <div className="ft-pin-position-pills">
              <button className="ft-pin-pill" onClick={() => handleApplyTestCourse("A")}>
                Provider A
              </button>
              <button className="ft-pin-pill" onClick={() => handleApplyTestCourse("B")}>
                Provider B
              </button>
              <button className="ft-pin-pill" onClick={handleClearTestCourse}>
                해제
              </button>
            </div>
          </div>
          <div className="ft-pin-position-row">
            <span className="ft-pin-position-label">
              내 위치(LocationProvider) <span className="ft-dev-badge">DEV</span>
            </span>
            <div className="ft-pin-position-pills">
              <button className="ft-pin-pill" onClick={handleGetMyLocation}>
                위치 가져오기
              </button>
            </div>
          </div>

          <div className="ft-pin-position-row">
            <span className="ft-pin-position-label">
              그린 구분 <span className="ft-dev-badge">DEV</span>
            </span>
            <div className="ft-pin-position-pills">
              {Object.entries(GREEN_SELECTION_LABELS).map(([value, label]) => (
                <button
                  key={value}
                  className={`ft-pin-pill ${greenSelection === value ? "is-active" : ""}`}
                  onClick={() => handleSetGreenSelection(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="ft-pin-position-row">
            <span className="ft-pin-position-label">
              핀 위치 정보 <span className="ft-dev-badge">DEV</span>
            </span>
            <div className="ft-pin-position-pills">
              {PIN_TIER_OPTIONS.map((opt) => (
                <button
                  key={opt.tier}
                  className={`ft-pin-pill is-location ${activeTier === opt.tier ? "is-active" : ""}`}
                  onClick={() => handleSetPinLocationStatus(opt.internalValue)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <p className="ft-pin-position-hint">
            {canCorrect
              ? "참가자별 위치를 보정한 추정값으로 전송합니다. (그린 구분만으로는 보정하지 않습니다)"
              : "측정값을 보정 없이 그대로 참고값으로 공유합니다."}
          </p>
        </div>
      )}

      {/* TASK-009 §6/§7-4: "현재 팀 기준" card, only when a share exists —
          now positioned last, after GPS + entry. Sprint 2: the per-player
          "동반자 GPS" grid that used to live here has been removed — that
          information now lives in the merged Player Summary panel
          (RoundScreen.jsx + PlayerCard.jsx), so it isn't duplicated here.
          This card stays because it's genuinely different information: not
          "what is each player's distance" but "what did the team just
          agree to use as the shared reference." */}
      {hasShare && (
        <div className={`ft-team-reference-bar ${flash ? "is-flash" : ""}`}>
          <span className="ft-team-reference-bar-label">현재 팀 기준</span>
          <span>
            {referencePlayerName} 실측 {lastShare.referenceDistanceM}m
            {referenceTimeLabel ? ` · ${referenceTimeLabel}` : ""}
          </span>
        </div>
      )}
    </div>
  );
}
