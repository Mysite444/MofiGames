"use client";

import { useEffect } from "react";

/**
 * Clears this (top-level) page's Media Session — fixes the "persistent
 * media notification" bug reported on Android Chrome: after playing a game
 * and then closing the tab or navigating away, Chrome kept showing its
 * media-player notification bar because the Media Session it had picked up
 * while the game's audio/video was running never got explicitly cleared.
 *
 * ── Why this happens in a Next.js portal specifically ───────────────────
 * Next.js client-side navigation (<Link>, router.push, etc.) does NOT do a
 * full page reload, so the browser never gets the usual "document
 * unloaded" signal that normally tears a Media Session down on a classic
 * multi-page site. The React tree unmounts, but the tab itself is still
 * "the same document" as far as the browser's media pipeline is concerned
 * — so a stale Media Session can survive the SPA-style transition. This
 * hook closes that gap explicitly instead of relying on an unload event
 * that may never fire.
 *
 * ── What this can and can't reach ────────────────────────────────────────
 * The game itself generally runs in a cross-origin <iframe>, which has its
 * OWN, isolated `navigator.mediaSession` — this parent page has no DOM API
 * to reach into a cross-origin frame and reset it directly, and there is no
 * Permissions-Policy/iframe `allow` directive for "media session" (unlike
 * `autoplay`, `fullscreen`, `gamepad`, etc. — see MDN's Permissions-Policy
 * directive list) that could restrict it from the parent's HTML either.
 * What this hook resets is this top-level page's OWN Media Session, which
 * is what Android Chrome's persistent notification actually reflects once
 * the tab is treated as "the thing playing media" — clearing it here is
 * the effective, real fix for the stuck notification.
 *
 * ── Cleanup paths covered ────────────────────────────────────────────────
 * 1. Unmount — SPA navigation away from the game page, or the game player
 *    itself being closed/unmounted client-side.
 * 2. `visibilitychange` → "hidden" — covers switching tabs, backgrounding
 *    the browser, and the tab being closed outright. Mobile Chrome does
 *    not reliably fire `beforeunload`/`unload` on tab close, but it does
 *    fire `visibilitychange` first, which is why that's used here instead.
 *
 * Every `navigator` access is guarded with `'mediaSession' in navigator`
 * so this is always a safe no-op on browsers that don't implement the
 * Media Session API (Firefox, Safari, older browsers, etc.).
 *
 * Used by both the desktop game frame (PlayFrame) and the mobile
 * fullscreen game overlay (MobileLandscapePlayer) — the two places the
 * game's <iframe> actually renders — so neither surface can drift out of
 * sync with the other.
 */
export function useMediaSessionCleanup() {
  useEffect(() => {
    function clearMediaSession() {
      if (!("mediaSession" in navigator)) return;
      try {
        navigator.mediaSession.playbackState = "none";
        navigator.mediaSession.metadata = null;
      } catch {
        // Some browsers can throw if this is touched at an unexpected
        // lifecycle point (e.g. mid-teardown) — never let that break the
        // actual page/navigation it's trying to clean up after.
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") clearMediaSession();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearMediaSession();
    };
  }, []);
}
