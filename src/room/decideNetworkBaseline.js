/**
 * decideNetworkBaseline.js
 * ------------------------------------------------------------------
 * RC4 — pure decision for RoundProvider's network-baseline effect,
 * extracted so the exact CONDITION ORDERING can be unit-tested without a
 * React runtime.
 *
 * Priority (order is load-bearing — Founder-caught bug was a mis-order):
 *   0. Network mode off               -> "none"       (do nothing)
 *   1. On the demo seed               -> "baseline"   (ALWAYS, even though
 *      the seed has 4 demo players — demo removal outranks every guard)
 *   2. Live/hydrating network round   -> "none"       (round_<ts>+active,
 *      or ANY round that already has real players — never clobber it)
 *   3. Already a clean baseline       -> "none"       (idempotent)
 *   4. Otherwise (empty non-network)  -> "baseline"   (establish baseline)
 *
 * @param {object} params
 * @param {boolean} params.networkCommunicationEnabled
 * @param {{id?: string, status?: string, players?: Array, isNetworkBaseline?: boolean}} params.round
 * @returns {"baseline" | "none"}
 */
export function decideNetworkBaseline({ networkCommunicationEnabled, round }) {
  if (!networkCommunicationEnabled) return "none";
  if (!round) return "none";

  const isDemoSeed = round.id === "round_demo_001";
  // 1 — demo seed removal has ABSOLUTE priority. Checked before any
  // players/live guard, because the seed legitimately has 4 players and a
  // players-based guard placed first would let it survive (the RC4 bug).
  if (isDemoSeed) return "baseline";

  // 2 — never clobber a live or hydrating network round.
  const hasRealPlayers = Array.isArray(round.players) && round.players.length > 0;
  const onLiveNetworkRound =
    typeof round.id === "string" && round.id.startsWith("round_") && round.status === "active";
  if (onLiveNetworkRound || hasRealPlayers) return "none";

  // 3 — idempotent: already a clean baseline.
  if (round.isNetworkBaseline === true) return "none";

  // 4 — some other empty/non-network state: establish a baseline.
  return "baseline";
}
