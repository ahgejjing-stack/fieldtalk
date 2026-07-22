import React, { useEffect, useRef, useState } from "react";

const REASON_MESSAGES = {
  file_not_found_or_unsupported: "사운드 파일을 찾을 수 없어요",
  autoplay_blocked: "브라우저가 자동 재생을 차단했어요",
  playback_failed: "재생에 실패했어요",
  playback_exception: "재생 중 오류가 발생했어요",
  tts_unsupported: "이 브라우저는 음성 합성을 지원하지 않아요",
  tts_failed: "음성 재생에 실패했어요",
  tts_exception: "음성 재생 중 오류가 발생했어요",
  missing_src: "등록된 음원 파일 경로가 없어요",
  sound_disabled: "비활성화된 사운드예요",
  sound_not_found: "카탈로그에서 사운드를 찾을 수 없어요",
  cooldown: "잠시 후 다시 시도해주세요",
  already_playing: "이미 재생 중이에요",
  unknown_source_type: "알 수 없는 사운드 형식이에요",
  unexpected_error: "예상치 못한 오류가 발생했어요",
};

/** Map an engine failure reason to a short, user-facing Korean message. */
export function reasonToMessage(reason) {
  return REASON_MESSAGES[reason] || "사운드를 재생할 수 없어요";
}

// Vite exposes import.meta.env.DEV; guard for non-Vite/test environments.
const isDevBuild =
  typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;

export { isDevBuild };

export default function SoundButton({ sound, icon: Icon, onPlay, forceShowRightsBadge }) {
  const [isBusy, setIsBusy] = useState(false);
  const [isCoolingDown, setIsCoolingDown] = useState(false);
  const cooldownTimer = useRef(null);

  useEffect(() => () => clearTimeout(cooldownTimer.current), []);

  const disabled = isBusy || isCoolingDown;
  const showRightsBadge =
    (forceShowRightsBadge ?? isDevBuild) &&
    (sound.rightsStatus === "prototype_only" ||
      sound.rightsStatus === "review_required" ||
      sound.rightsStatus === "prototype_test");

  const handleClick = async () => {
    if (disabled) return;
    setIsBusy(true);
    const result = await onPlay(sound);
    setIsBusy(false);
    if (result && result.success) {
      setIsCoolingDown(true);
      const wait = sound.cooldownMs ?? 3000;
      cooldownTimer.current = setTimeout(() => setIsCoolingDown(false), wait);
    }
  };

  return (
    <button
      type="button"
      className={`ft-reaction tone-${sound.tone || "green"} ${disabled ? "is-disabled" : ""}`}
      onClick={handleClick}
      disabled={disabled}
      aria-disabled={disabled}
      aria-busy={isBusy}
    >
      {showRightsBadge && (
        <span className={`ft-rights-badge is-${sound.rightsStatus}`}>
          {sound.rightsStatus === "prototype_only" || sound.rightsStatus === "prototype_test" ? "TEST" : "검토중"}
        </span>
      )}
      <Icon size={20} strokeWidth={2} />
      <span>{sound.label}</span>
    </button>
  );
}
