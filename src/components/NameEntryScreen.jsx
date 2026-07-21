import React, { useState } from "react";
import { Radio } from "lucide-react";

/**
 * RC2 real-device fix — the root cause behind "두 번째 휴대폰이 참가하는
 * 방법을 찾을 수 없다": a fresh device with no stored identity silently
 * defaults to DEFAULT_IDENTITY_USER_ID ("player_jaesik") — the SAME
 * identity as the host. There was never a production "누구세요" step;
 * only the DEV-only Identity Switch screen could pick a different
 * person, and that's hidden in production on purpose (Preview
 * Simulation honesty work). This screen is the real, non-DEV
 * replacement: shown once, only when someone arrives via a real invite
 * link (?join=CODE) on a device that has never set up an identity
 * before. On submit, App.jsx generates a fresh unique userId, saves it,
 * and reloads — the existing ?join= auto-join logic then proceeds
 * exactly as before, just with a real, distinct identity this time.
 */
export default function NameEntryScreen({ roomCode, onSubmit }) {
  const [name, setName] = useState("");

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <div className="ft-namegate">
      <div className="ft-namegate-icon">
        <Radio size={28} strokeWidth={2} />
      </div>
      <div className="ft-namegate-title">FIELDTALK</div>
      <p className="ft-namegate-sub">
        Room {roomCode}에 참가합니다.
        <br />
        먼저 이름을 알려주세요.
      </p>
      <input
        className="ft-namegate-input"
        type="text"
        inputMode="text"
        placeholder="이름"
        value={name}
        maxLength={12}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
        }}
      />
      <button type="button" className="ft-namegate-btn" onClick={handleSubmit} disabled={!name.trim()}>
        참가하기
      </button>
    </div>
  );
}
