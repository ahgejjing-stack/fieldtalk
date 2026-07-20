import React from "react";
import { ChevronLeft } from "lucide-react";
import { useIdentity } from "../context/useIdentity.js";

/**
 * IdentitySelectScreen — Runtime Identity & Main-to-Main PTT Integration
 * v0.4 §4 Deliverable #2. DEV-only (HomeScreen.jsx gates the entry point
 * behind isDevMode) — "일반 사용자 화면에는 DEV 선택 UI 노출 금지".
 *
 * Selecting an identity saves it (localStorage: userId/displayName;
 * sessionStorage: a fresh deviceSessionId) and reloads the page — see
 * IdentityProvider.jsx for why this is a full reload rather than a
 * reactive in-place swap.
 */
export default function IdentitySelectScreen({ onBack }) {
  const identity = useIdentity();

  return (
    <div className="ft-screen ft-home">
      <div className="ft-home-header">
        <button className="ft-icon-btn" onClick={onBack} aria-label="뒤로">
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <div className="ft-home-brand">
          <span>Identity 선택 (DEV)</span>
        </div>
        <div style={{ width: 32 }} />
      </div>

      <div className="ft-home-scroll">
        <div className="ft-cta-card">
          <span className="ft-eyebrow">현재: {identity.displayName} ({identity.userId})</span>
          <p className="ft-pin-position-hint">
            선택하면 저장 후 새로고침됩니다 — 이 브라우저(탭)가 그 사람으로 FIELDTALK을 사용하게 됩니다.
          </p>
          <div className="ft-room-member-list" style={{ marginTop: 10 }}>
            {identity.demoIdentities.map((id) => (
              <button
                key={id.userId}
                type="button"
                className={`ft-room-member-row ${id.userId === identity.userId ? "is-joined" : ""}`}
                onClick={() => identity.setIdentity(id.userId, id.displayName)}
              >
                <span className="ft-room-member-name">{id.displayName}</span>
                <span className="ft-room-member-status">{id.userId === identity.userId ? "현재 identity" : "선택"}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
