"use client";

import { useEffect, useRef } from "react";

/**
 * Behaves like `setInterval(callback, delayMs)`, except the timer is torn
 * down whenever the tab is hidden and restarted — with an immediate catch-
 * up call — when it becomes visible again, instead of ticking forever in
 * the background.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 * Several Admin → Cache dashboards (Search, Metadata, Fragment, Monitoring)
 * auto-refresh their live stats every 10-30s via a plain `setInterval` with
 * no visibility check. Browsers don't stop a background tab's timers
 * outright — Chrome throttles them to roughly once a minute after several
 * minutes hidden, but they keep firing — so a cache dashboard tab left open
 * in the background (a very easy thing to do while working on something
 * else) quietly keeps polling its stats endpoint for as long as the tab
 * stays open, whether or not anyone is looking at it. Every one of those
 * authenticated polls also pays middleware's full session-refresh cost (see
 * `src/middleware.ts`'s `auth.getUser()` call), so this is a genuine, easy-
 * to-hit source of Vercel middleware/function usage that has nothing to do
 * with real visitors — it's a stats dashboard polling itself in a
 * background tab.
 *
 * `usePlayTimeTracking` (`lib/game-library.ts`) already uses this same
 * "only count/tick while visible" pattern for the same class of problem —
 * this hook generalizes it for any interval-driven auto-refresh.
 */
export function useVisibleInterval(callback: () => void, delayMs: number) {
  // Ref so the effect below doesn't need `callback` in its dependency
  // array — callers typically pass a fresh function identity every render
  // (e.g. `useCallback` results still change if their own deps change),
  // and re-running this effect on every such change would otherwise reset
  // the timer far more often than intended.
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    function start() {
      if (timer) return;
      timer = setInterval(() => callbackRef.current(), delayMs);
    }

    function stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        // Catch up immediately rather than waiting up to `delayMs` for
        // the first tick after coming back — matches what someone
        // actually wants when they switch back to this tab ("show me
        // current numbers now that I'm looking again").
        callbackRef.current();
        start();
      } else {
        stop();
      }
    }

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [delayMs]);
}
