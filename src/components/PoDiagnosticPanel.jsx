import React from "react";

/**
 * PoDiagnosticPanel.jsx
 * ------------------------------------------------------------------
 * RC4 TEMPORARY — a small fixed overlay that prints the exact round-state
 * values driving the RoundScreen loading gate, so a SINGLE real-device
 * screenshot is enough to diagnose the "라운드 준비 중" stall without
 * needing console access.
 *
 * Shows: round.id · round.status · round.players.length ·
 *        round.isNetworkBaseline · loadingGate.
 *
 * This is intentionally ugly and always-on-top. Remove once the round
 * lifecycle is confirmed on device (it is gated by a single prop so it can
 * be switched off in one place).
 * ------------------------------------------------------------------
 */
export default function PoDiagnosticPanel({ round, players, loadingGate, networkCommunicationEnabled }) {
  const rows = [
    ["round.id", String(round?.id)],
    ["round.status", String(round?.status)],
    ["players.length", String(players?.length ?? (round?.players?.length ?? 0))],
    ["isNetworkBaseline", String(round?.isNetworkBaseline === true)],
    ["networkEnabled", String(!!networkCommunicationEnabled)],
    ["loadingGate", String(!!loadingGate)],
  ];
  return (
    <div
      style={{
        position: "fixed",
        top: 8,
        right: 8,
        zIndex: 99999,
        background: "rgba(0,0,0,0.82)",
        color: "#0f0",
        font: "11px/1.5 ui-monospace, Menlo, monospace",
        padding: "8px 10px",
        borderRadius: 8,
        maxWidth: 240,
        pointerEvents: "none",
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
      }}
      aria-hidden="true"
    >
      <div style={{ color: "#ff0", marginBottom: 4, fontWeight: 700 }}>PO DIAG · ROUND</div>
      {rows.map(([k, v]) => (
        <div key={k}>
          <span style={{ color: "#8cf" }}>{k}</span>: <span>{v}</span>
        </div>
      ))}
    </div>
  );
}
