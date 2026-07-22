import React, { useEffect, useState } from "react";
import {
  Award,
  Check,
  CheckCircle2,
  ChevronLeft,
  Flame,
  MapPin,
  Mic,
  PartyPopper,
  Radio,
  Sparkles,
  ThumbsUp,
  Trophy,
  X,
} from "lucide-react";
import { useAudioEngine } from "../hooks/useAudioEngine.js";
import { playSendCompleteTone } from "../services/audioEngine.js";
import { useRound } from "../context/useRound.js";
import { useCommunication } from "../context/useCommunication.js";
import SoundButton, { reasonToMessage } from "./SoundButton.jsx";
import PersonalizedCheer from "./PersonalizedCheer.jsx";

// RC4 P1 — prototype_test sounds (the internal-only E2E test chime) must
// never appear for a real user in production; DEV-gated the same way
// other developer-only surfaces in this app are.
const isDevModeGallery = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;

// Catalog items store an icon *name* (plain data, JSON-safe) — this is the
// only place that maps those names to actual lucide-react components.
const ICONS = {
  "thumbs-up": ThumbsUp,
  trophy: Trophy,
  "party-popper": PartyPopper,
  sparkles: Sparkles,
  flame: Flame,
  award: Award,
  mic: Mic,
  check: Check,
  "check-circle": CheckCircle2,
  "map-pin": MapPin,
  radio: Radio,
};

// The 5 tiles a person sees first — "개인응원" reuses the existing
// PersonalizedCheer component (folded in here instead of its own permanent
// section), "즐겨찾기" is a client-side-only preference (see FAVORITES_KEY
// below), and the other three map onto existing catalog categories.
const CATEGORIES = [
  { id: "shot", icon: "🎯", label: "샷" },
  { id: "green", icon: "⛳", label: "그린" },
  { id: "score", icon: "🏆", label: "스코어" },
  { id: "favorites", icon: "⭐", label: "즐겨찾기" },
  { id: "personal", icon: "❤️", label: "개인응원" },
];
const CATALOG_CATEGORY_MAP = { shot: "gallery", green: "team", score: "achievement" };

// Small, self-contained UI preference — not Round Engine state, so it
// intentionally does NOT go through roundReducer/roundActions. Losing this
// on clear-storage is an acceptable trade-off for a "which buttons do I use
// most" convenience list.
const FAVORITES_KEY = "fieldtalk.gallery.favorites.v1";

function loadFavorites() {
  try {
    const raw = window.localStorage?.getItem(FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (err) {
    return new Set();
  }
}

function saveFavorites(set) {
  try {
    window.localStorage?.setItem(FAVORITES_KEY, JSON.stringify([...set]));
  } catch (err) {
    /* ignore — storage full/disabled, favorites just won't persist */
  }
}

/**
 * GalleryPanel — an Overlay, not a screen. Closed by default (`isOpen`
 * false renders nothing). Category grid first; picking a category shows
 * that category's sounds; picking a sound plays it, logs it to the Round
 * Engine event log (unchanged from before), and calls `onClose()` so the
 * person lands back on the play screen automatically.
 */
export default function GalleryPanel({ isOpen, onClose, onToast }) {
  const { catalog } = useAudioEngine();
  const { dispatch, actions, meId } = useRound();
  const communication = useCommunication(); // P0-5 fix
  const [activeCategory, setActiveCategory] = useState(null);
  const [favorites, setFavorites] = useState(() => loadFavorites());

  // Always reopen at the category grid, never mid-category from last time.
  useEffect(() => {
    if (isOpen) setActiveCategory(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const itemsForCategory = (catId) => {
    if (catId === "favorites") {
      return catalog.filter((s) => favorites.has(s.id) && s.enabled && (isDevModeGallery || s.rightsStatus !== "prototype_test"));
    }
    const catalogCategory = CATALOG_CATEGORY_MAP[catId];
    return catalog.filter(
      (s) => s.category === catalogCategory && s.enabled && (isDevModeGallery || s.rightsStatus !== "prototype_test")
    );
  };

  const toggleFavorite = (soundId) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(soundId)) next.delete(soundId);
      else next.add(soundId);
      saveFavorites(next);
      return next;
    });
  };

  const handlePlay = async (sound) => {
    // RC4 CHEER POLICY (Project Eagle) — the SENDER must NOT hear the cheer
    // VOICE. The sender gets: send animation (Event Board bubble via the
    // soundPlayed event), haptic, and a short "send complete" tone. The
    // actual cheer voice is played only on the RECEIVER (App.jsx's
    // receivedSoundPlayed handler). Previously the sender called play()
    // which spoke the full voice locally — that's what this removes.

    // Guard: still respect cooldown/availability via a lightweight check
    // rather than actually voicing the sound. We treat the tap as always
    // eligible unless the catalog marks it unavailable.
    const isAvailable = !catalog || catalog.some?.((s) => s.id === sound.id) !== false;
    if (isAvailable === false) {
      onToast(reasonToMessage?.("unavailable") ?? "지금은 사용할 수 없습니다");
      return { success: false, reason: "unavailable" };
    }

    // 1) Send animation — record in the Round Engine's shared event log so
    //    PlayerCard's Event Board shows the "👏 {label}" bubble on my card.
    dispatch(
      actions.soundPlayed({
        soundId: sound.id,
        category: sound.category,
        label: sound.label,
        actorPlayerId: meId,
      })
    );

    // 2) Haptic — sender-side tactile confirmation (no-op where unsupported).
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(30);
    } catch {
      /* ignore */
    }

    // 3) Send-complete tone — a short, neutral confirmation that is NOT the
    //    cheer voice. Uses a WebAudio blip so it never speaks the phrase.
    try {
      playSendCompleteTone();
    } catch {
      /* ignore */
    }

    // 4) Broadcast to teammates — the receiver plays the actual voice.
    communication.shareSoundPlayed?.({
      soundId: sound.id,
      category: sound.category,
      label: sound.label,
      targetUserIds: null, // broadcast to everyone else in the room
    });

    onClose();
    return { success: true };
  };

  const activeCategoryMeta = CATEGORIES.find((c) => c.id === activeCategory);

  return (
    <div className="ft-gallery-overlay">
      <div className="ft-gallery-scrim" onClick={onClose} />
      <div className="ft-gallery-sheet">
        <div className="ft-gallery-sheet-head">
          {activeCategory ? (
            <button type="button" className="ft-gallery-back-btn" onClick={() => setActiveCategory(null)}>
              <ChevronLeft size={16} strokeWidth={2.2} />
              {activeCategoryMeta?.label}
            </button>
          ) : (
            <span className="ft-gallery-sheet-title">응원 · 효과음</span>
          )}
          <button type="button" className="ft-icon-btn" onClick={onClose} aria-label="닫기">
            <X size={16} strokeWidth={2.2} />
          </button>
        </div>

        {!activeCategory && (
          <div className="ft-gallery-category-grid">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className="ft-gallery-category-tile"
                onClick={() => setActiveCategory(cat.id)}
              >
                <span className="ft-gallery-category-icon">{cat.icon}</span>
                <span className="ft-gallery-category-label">{cat.label}</span>
              </button>
            ))}
          </div>
        )}

        {activeCategory === "personal" && <PersonalizedCheer onToast={onToast} onPlayed={onClose} />}

        {activeCategory && activeCategory !== "personal" && (
          <div className="ft-gallery-item-list">
            {itemsForCategory(activeCategory).map((sound) => (
              <div className="ft-gallery-item" key={sound.id}>
                <SoundButton sound={sound} icon={ICONS[sound.icon] || ThumbsUp} onPlay={handlePlay} />
                <button
                  type="button"
                  className="ft-favorite-star"
                  onClick={() => toggleFavorite(sound.id)}
                  aria-label="즐겨찾기"
                >
                  {favorites.has(sound.id) ? "⭐" : "☆"}
                </button>
              </div>
            ))}
            {activeCategory === "favorites" && itemsForCategory("favorites").length === 0 && (
              <p className="ft-gallery-empty">즐겨찾기한 효과음이 없어요. 다른 카테고리에서 ☆를 눌러보세요.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
