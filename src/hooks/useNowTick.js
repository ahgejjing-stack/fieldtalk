import { useEffect, useState } from "react";

/**
 * useNowTick(intervalMs) — re-renders the calling component every
 * `intervalMs` with a fresh `Date.now()` value. Used by PlayerCard.jsx to
 * notice when a transient event (e.g. "실측 공유") has expired and it's
 * time to fall back to the default idle display, without needing the
 * Round Engine itself to track timers.
 */
export function useNowTick(intervalMs = 500) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
