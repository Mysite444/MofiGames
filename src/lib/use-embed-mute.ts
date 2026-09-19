"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Shared "mute" contract for embedded games.
 *
 * A cross-origin iframe's audio can't be forced silent from the parent
 * page — there's no DOM API for it (unlike <video>/<audio>, iframes have no
 * `.muted`), and every game we embed (both third-party embed URLs and our
 * own Vercel-Blob-hosted uploads) genuinely lives on a different origin, so
 * even reading into the iframe's DOM throws a cross-origin SecurityError.
 *
 * The only thing a host page CAN do is ask nicely: broadcast a message and
 * hope the game's own code is listening for it. This hook does that via our
 * own uniquely-namespaced `{ type: "mofigames:mute", muted }` postMessage,
 * repeated on a short retry and again once the iframe's `load` event fires,
 * so a game whose listener attaches partway through its own startup still
 * catches it. This mirrors how CrazyGames/Poki-style portals solve the same
 * constraint — the host defines the contract, the game opts in — but a
 * given embed only actually goes quiet if it happens to implement this
 * exact convention; that ceiling is a browser platform limitation, not
 * something fixable from the parent page.
 *
 * We deliberately do NOT also guess at generic message shapes a game might
 * recognise (bare "mute" strings, `{ command: "mute" }`, etc.). Many
 * third-party HTML5 games (anything built on the GameDistribution SDK, for
 * instance) wire "pause" and "mute" to the SAME combined handler, so
 * broadcasting several guesses per tap can double-trigger a game's own
 * combined pause/mute toggle and drift it out of sync with our icon. Only
 * our own uniquely-namespaced message is sent — nothing else living inside
 * someone else's embed will ever collide with that exact string.
 *
 * Used by both the desktop player (GamePlayerPanel) and the mobile
 * fullscreen overlay (MobileLandscapePlayer) so the two surfaces can never
 * drift onto two different message contracts.
 */
export function useEmbedMute(iframeRef: React.RefObject<HTMLIFrameElement | null>) {
  const [muted, setMuted] = useState(false);

  function postMuteState(next: boolean) {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage({ type: "mofigames:mute", muted: next }, "*");
    } catch {
      // Ignore — a hostile or torn-down iframe shouldn't break the UI.
    }
  }

  // Click handler only ever updates state — no side effects here or inside
  // the updater. React updater functions are allowed to run more than once
  // per state change (Strict Mode double-invoke, interrupted renders,
  // etc.), so a postMessage/setTimeout side effect living inside the
  // updater itself would fire multiple, overlapping broadcasts per tap.
  // Broadcasting instead lives in the effect below, keyed on `muted`,
  // which is guaranteed to run exactly once per committed change.
  function toggleMute() {
    setMuted((prev) => !prev);
  }

  // Broadcasts the current mute state into the iframe whenever it changes.
  // Skips the very first run (mount) since there's nothing to announce yet.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    postMuteState(muted);
    // Some games only attach their message listener partway through their
    // own startup sequence, so a single message fired the instant the icon
    // flips can arrive before anyone is listening. Re-sending covers that
    // race without needing to know a given game's exact init timing. If
    // `muted` flips again before these fire, the cleanup below cancels
    // them so a stale value is never sent.
    const t1 = setTimeout(() => postMuteState(muted), 400);
    const t2 = setTimeout(() => postMuteState(muted), 1500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muted]);

  /**
   * Re-broadcasts the current mute state once the iframe finishes loading.
   * Covers the common case where the player taps Mute *before* the game has
   * finished initialising — the very first postMuteState() call above would
   * have had no listener to catch it yet. Reads `muted` directly (not a
   * ref) — this function is recreated every render with the current value,
   * and only the browser's real "load" event ever invokes it, so there's no
   * stale-closure risk here.
   */
  function handleIframeLoad() {
    if (muted) postMuteState(true);
  }

  return { muted, toggleMute, handleIframeLoad };
}
