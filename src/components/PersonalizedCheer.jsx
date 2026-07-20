import React, { useState } from "react";
import { PLAYERS_SEED } from "../data/seed.js";
import { useAudioEngine } from "../hooks/useAudioEngine.js";
import { reasonToMessage } from "./SoundButton.jsx";

// The cheer phrase itself lives in soundCatalog.json (category: "personalized",
// textTemplate: "{name} 아이가~!!") — nothing is hardcoded here. This id is
// just which catalog entry to use; swapping/adding catalog entries with
// category "personalized" doesn't require touching this component.
const PERSONALIZED_SOUND_ID = "personalized_aiga";

export default function PersonalizedCheer({ onToast, onPlayed }) {
  const { play } = useAudioEngine();
  const [activeId, setActiveId] = useState(null);

  const handleCheer = async (player) => {
    if (activeId) return; // one cheer at a time
    setActiveId(player.id);
    const result = await play(PERSONALIZED_SOUND_ID, {
      vars: { name: player.cheerName || player.name },
    });
    setActiveId(null);
    if (!result.success) {
      onToast(reasonToMessage(result.reason));
      return;
    }
    if (onPlayed) onPlayed();
  };

  return (
    <div className="ft-cheer-row">
      {PLAYERS_SEED.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`ft-cheer-chip ${activeId === p.id ? "is-active" : ""}`}
          disabled={activeId !== null}
          onClick={() => handleCheer(p)}
        >
          <span className="ft-avatar ft-avatar-xs" style={{ "--avatar-color": p.color }}>
            {p.name}
          </span>
          <span>{p.name} 응원</span>
        </button>
      ))}
    </div>
  );
}
