import { useCallback, useState } from "react";
import { getSoundCatalog, playSoundById, speakText } from "../services/audioEngine.js";

/**
 * useAudioEngine — thin React wrapper around services/audioEngine.js.
 * Keeps components free of direct engine imports and tracks the last
 * error for optional debugging/telemetry.
 */
export function useAudioEngine() {
  const [lastError, setLastError] = useState(null);

  const play = useCallback(async (id, opts) => {
    const result = await playSoundById(id, opts);
    setLastError(result.success ? null : result);
    return result;
  }, []);

  const speak = useCallback(async (text, opts) => {
    const result = await speakText(text, opts);
    setLastError(result.success ? null : result);
    return result;
  }, []);

  return {
    catalog: getSoundCatalog(),
    play,
    speak,
    lastError,
  };
}
