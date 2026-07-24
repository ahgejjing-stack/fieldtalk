import React, { useState, useEffect } from "react";
import { getDiagEntries, subscribeDiag, clearDiag } from "../config/diagLog.js";

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
  // RC4 P0 — Room/Round/build state. Previously this lived in
  // PoDiagnosticPanel, which only renders INSIDE RoundScreen — so it was
  // impossible to see at the exact moment being investigated (ROUND START
  // not working while still on Home/RoomOverlay). This panel is mounted at
  // App level and is reachable from every screen via the PO button, so the
  // state now travels with it.
  buildStamp = null,
  roomCode = null,
  roomStatus = null,
  roomMemberCount = null,
  roomHostUserId = null,
  networkEnabled = null,
  roundId = null,
  roundStatus = null,
  roundPlayerCount = null,
  isNetworkBaseline = null,
  screen = null,
}) {
  const [collapsed, setCollapsed] = useState(true);
  // RC4 P0 — the Room/Round block must be visible even before any
  // communication lifecycle exists (p0Lifecycle is null until a network
  // session starts). Previously `if (!p0Lifecycle) return null` hid the
  // whole panel — including the PO button — in exactly the pre-round state
  // being debugged.
  const hasLifecycle = !!p0Lifecycle;

  if (collapsed) {
    return (
      <button type="button" className="ft-p0-overlay-collapsed" onClick={() => setCollapsed(false)}>
        PO
      </button>
    );
  }

  const stateRows = [
    ["build", buildStamp ?? "—"],
    ["screen", screen ?? "—"],
    ["room.code", roomCode ?? "none"],
    ["room.status", roomStatus ?? "none"],
    ["room.members", roomMemberCount == null ? "—" : String(roomMemberCount)],
    ["room.hostUserId", roomHostUserId ?? "none"],
    ["networkEnabled", networkEnabled == null ? "—" : String(networkEnabled)],
    ["round.id", roundId ?? "—"],
    ["round.status", roundStatus ?? "—"],
    ["round.players", roundPlayerCount == null ? "—" : String(roundPlayerCount)],
    ["isNetworkBaseline", isNetworkBaseline == null ? "—" : String(isNetworkBaseline)],
  ];

  // RC4 P0 — on-device diagnostic log. Founder has no desktop console
  // attached to the phone, so the bracketed [TAG] lines were invisible
  // during device testing. This renders the most recent ones inline.
  const [, forceTick] = useState(0);
  useEffect(() => subscribeDiag(() => forceTick((n) => n + 1)), []);
  const diagEntries = getDiagEntries();

  const lastFail = hasLifecycle
    ? STAGE_ORDER.map((k) => p0Lifecycle[k]).find((e) => e?.status === "FAIL")
    : null;

  return (
    <div className="ft-p0-overlay">
      <div className="ft-p0-overlay-head">
        <span>RC4 PO DIAG (DEV)</span>
        <button type="button" onClick={() => setCollapsed(true)} aria-label="닫기">
          ×
        </button>
      </div>

      {/* RC4 P0 — ROOM / ROUND STATE, always shown, every screen. */}
      <div style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.15)", font: "11px/1.6 ui-monospace, Menlo, monospace" }}>
        <div style={{ color: "#ffd60a", fontWeight: 700, marginBottom: 4 }}>ROOM / ROUND STATE</div>
        {stateRows.map(([k, v]) => (
          <div key={k} style={{ wordBreak: "break-all" }}>
            <span style={{ color: "#8cf" }}>{k}</span>: <span style={{ color: "#fff" }}>{v}</span>
          </div>
        ))}
      </div>

      {!hasLifecycle && (
        <div style={{ padding: "8px 10px", font: "11px/1.5 ui-monospace, monospace", color: "#8e8e93" }}>
          (네트워크 세션 시작 전 — Lifecycle 없음)
        </div>
      )}

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

      {/* RC4 P0 — recent tagged diagnostics, newest last. */}
      <div style={{ padding: "8px 10px", borderTop: "1px solid rgba(255,255,255,0.15)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ color: "#ffd60a", fontWeight: 700, font: "11px ui-monospace, monospace" }}>
            DIAG LOG ({diagEntries.length})
          </span>
          <button
            type="button"
            onClick={clearDiag}
            style={{ font: "10px ui-monospace, monospace", background: "#3a3a3c", color: "#fff", border: "none", borderRadius: 6, padding: "4px 8px" }}
          >
            clear
          </button>
        </div>
        <div style={{ maxHeight: 220, overflowY: "auto", font: "10px/1.45 ui-monospace, Menlo, monospace" }}>
          {diagEntries.length === 0 && <div style={{ color: "#8e8e93" }}>(아직 로그 없음)</div>}
          {diagEntries.map((e, i) => (
            <div
              key={i}
              style={{
                color: e.level === "error" ? "#ff453a" : e.level === "warn" ? "#ffd60a" : "#d1d1d6",
                wordBreak: "break-all",
                marginBottom: 2,
              }}
            >
              {e.text}
            </div>
          ))}
        </div>
      </div>

      {hasLifecycle &&
        STAGE_ORDER.map((key) => {
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
