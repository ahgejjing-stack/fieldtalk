import React, { useState } from "react";

const STAGE_LABELS = {
  roomJoin: "1. Room Join",
  offerCreated: "2. Offer 생성",
  answerReceived: "3. Answer 수신",
  iceConnectionState: "4. ICE Connection",
  peerConnectionState: "5. Peer Connection",
  remoteTrackReceived: "6. Remote Track",
  audioElementAttach: "7. Audio Element",
  playCalled: "8. play() 호출",
  playResult: "9. play() 결과",
  remoteSignalDetected: "10. remoteSignalDetected",
  audiblePlaybackConfirmed: "11. 실제 청취 확인 (수동)",
};
const STAGE_ORDER = Object.keys(STAGE_LABELS);

const STATUS_COLOR = {
  PASS: "#5ddba0",
  FAIL: "#ff5b4c",
  IN_PROGRESS: "#e6b43c",
};

/** RC4 P0 review — DEV-only visual companion to the [FIELDTALK P0]
 * console logs, extended with live level diagnostics so a real-device
 * tester without Safari remote console access can still see exactly
 * what the analyser is measuring. remoteSignalDetected (auto, code
 * confirms a real sustained signal) and audiblePlaybackConfirmed
 * (always "—", manual/human-only — see NetworkPttClient.js) are kept
 * visibly distinct on purpose: the code never claims to have heard
 * anything, only to have measured something. */
export default function P0DebugOverlay({
  p0Lifecycle,
  p0LevelDebug,
  // RC4 P1-2 — remote-audio diagnostics for the "signal PASS / no sound"
  // investigation, readable on a phone without a desktop console.
  remoteAudioContextState = null,
  remoteTrackAttached = false,
  lastAudioPlaybackAttempt = null,
}) {
  const [collapsed, setCollapsed] = useState(true);
  if (!p0Lifecycle) return null;

  if (collapsed) {
    return (
      <button type="button" className="ft-p0-overlay-collapsed" onClick={() => setCollapsed(false)}>
        P0
      </button>
    );
  }

  const lastFail = STAGE_ORDER.map((k) => p0Lifecycle[k]).find((e) => e?.status === "FAIL");

  return (
    <div className="ft-p0-overlay">
      <div className="ft-p0-overlay-head">
        <span>RC4 P0 Lifecycle (DEV)</span>
        <button type="button" onClick={() => setCollapsed(true)} aria-label="닫기">
          ×
        </button>
      </div>

      {p0LevelDebug && (
        <div className="ft-p0-overlay-levels">
          <div>RMS: {p0LevelDebug.rms}</div>
          <div>rawLevel: {p0LevelDebug.rawLevel}</div>
          <div>임계값: {p0LevelDebug.threshold}</div>
          <div>최대 RMS: {p0LevelDebug.maxRms}</div>
          <div>최대 rawLevel: {p0LevelDebug.maxRawLevel}</div>
        </div>
      )}

      {/* RC4 P1-2 — the five Founder-readable remote-audio diagnostics the
          RC4 decision asked for, in one place. remoteSignalDetected +
          play() result already appear in the stage list below; these are
          the remaining three plus a plain restatement of the play result. */}
      <div className="ft-p0-overlay-levels">
        <div>AudioContext: {remoteAudioContextState ?? "—"}</div>
        <div>Remote Track Attached: {remoteTrackAttached ? "YES" : "NO"}</div>
        <div>
          play() 결과:{" "}
          {lastAudioPlaybackAttempt
            ? lastAudioPlaybackAttempt.ok
              ? "OK"
              : `FAIL (${lastAudioPlaybackAttempt.errorName ?? "unknown"})`
            : "—"}
        </div>
        <div>
          마지막 재생 오류:{" "}
          {lastAudioPlaybackAttempt && !lastAudioPlaybackAttempt.ok
            ? lastAudioPlaybackAttempt.errorMessage ?? lastAudioPlaybackAttempt.errorName ?? "unknown"
            : "없음"}
        </div>
      </div>

      {STAGE_ORDER.map((key) => {
        const entry = p0Lifecycle[key];
        const status = key === "audiblePlaybackConfirmed" ? "— (수동 확인 필요)" : entry?.status ?? "—";
        const color = STATUS_COLOR[status] ?? "#8a9a90";
        return (
          <div className="ft-p0-overlay-row" key={key}>
            <span className="ft-p0-overlay-label">{STAGE_LABELS[key]}</span>
            <span className="ft-p0-overlay-status" style={{ color }}>
              {status}
            </span>
            {entry?.detail && (
              <span className="ft-p0-overlay-detail">{JSON.stringify(entry.detail).slice(0, 60)}</span>
            )}
          </div>
        );
      })}

      {lastFail && (
        <div className="ft-p0-overlay-lasterror">
          마지막 오류: {lastFail.detail?.errorName ?? lastFail.detail?.reason ?? "unknown"} —{" "}
          {lastFail.detail?.errorMessage ?? lastFail.detail?.message ?? ""}
        </div>
      )}
    </div>
  );
}
