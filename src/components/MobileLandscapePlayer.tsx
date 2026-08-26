"use client";

/**
 * MobileLandscapePlayer
 *
 * Full-screen landscape game overlay for mobile.  A small host-rendered
 * control column (Exit / Invite / Mute) sits along the LEFT edge of the
 * game — same position as the native UI shown in the reference screenshot
 * (Paint To Hide's own Exit/Invite/Sound icons) — because we can't rely on
 * every embedded game (third-party embed OR uploaded bundle) shipping its
 * own working controls, and even when a game *does* draw its own Exit
 * button, it has no way to reach through the iframe boundary and close our
 * overlay unless it happens to speak our postMessage convention. Building
 * our own guarantees Exit/Invite/Mute always work, for every game.
 *
 * ── How the player is closed ─────────────────────────────────────────────
 * Four paths, all of which unmount this component and return the user to
 * the game-page UI (portrait, out of fullscreen):
 *   1. Our own "Exit" button (left control column) — calls onClose()
 *      directly.
 *   2. The embedded game itself, IF it opts into our exit convention by
 *      posting `{ type: "mofigames:exit" }` (or a bare `"exit"` string) to
 *      the parent window — see the message listener below. Best-effort:
 *      most embeds won't send this, which is exactly why (1) exists.
 *   3. Hardware / browser Back (Android gesture, iOS edge-swipe, browser
 *      chrome ← button) — intercepted via a synthetic `history.pushState`
 *      + `popstate` listener so Back closes the overlay first instead of
 *      navigating off the game page.
 *   4. Keyboard Escape — developer convenience on desktop.
 *
 * ── Mute ──────────────────────────────────────────────────────────────────
 * A cross-origin iframe's audio can't be forced silent from the parent
 * page — there's no DOM API for it (unlike <video>/<audio>, iframes have
 * no `.muted`), and every game here (both third-party embeds and our own
 * Vercel-Blob-hosted uploads) genuinely lives on a different origin, so
 * even reading into the iframe's DOM throws a cross-origin SecurityError.
 * The Sound button therefore does two things: (a) always flips its own
 * icon/state immediately, so the control itself never feels broken, and
 * (b) broadcasts several postMessage shapes into the iframe on a
 * best-effort basis — our own `{ type: "mofigames:mute", muted }`
 * convention plus a few common alternates — repeated on a short retry and
 * again once the iframe's `load` event fires, so a game whose own
 * listener attaches partway through its startup still catches it. This
 * mirrors how CrazyGames/Poki-style portals solve the same constraint —
 * the host defines the contract, the game opts in — but a given embed
 * only actually goes quiet if it happens to implement one of these; that
 * ceiling is a browser platform limitation, not something fixable from
 * the parent page.
 *
 * ── Invite ────────────────────────────────────────────────────────────────
 * We have no visibility into the embedded game's session/room state (it's
 * sandboxed behind the iframe), so "Invite" shares the current game page's
 * URL via the native share sheet (falling back to clipboard) rather than a
 * game-specific room code — the same mechanism as the desktop Share button.
 *
 * ── Three-layer rotation strategy ────────────────────────────────────────
 *  Layer 1 — Native fullscreen + orientation lock (Android Chrome / modern
 *             Chromium):  requestFullscreen() → screen.orientation.lock(
 *             "landscape").  The OS rotates its own chrome; no CSS needed.
 *
 *  Layer 2 — CSS rotation fallback (iOS Safari + any browser that refuses
 *             Layer 1):  The game container gets transform:rotate(90deg)
 *             with dimensions derived from window.screen (the true physical
 *             pixel dimensions, not the safe-area-clipped viewport units).
 *             This fills the entire physical screen — including the notch
 *             and home-indicator zones — so the game's own edge UI (Exit,
 *             Invite, Sound…) is never clipped by a safe-area gap.
 *
 *  Layer 3 — Natural landscape (device already landscape, or portrait game):
 *             No rotation.  overlay fills via inset:0.
 *
 * ── Why window.screen instead of 100dvh × 100dvw ─────────────────────────
 * dvh / dvw are safe-viewport units: they exclude the notch, home indicator,
 * and address bar.  Using them for the rotated container leaves safe-area
 * gaps (typically 44 px top / 34 px bottom on iPhone) where the overlay
 * background shows through.  After a 90° rotation those gaps land on the
 * game's LEFT and RIGHT edges — precisely where the Exit / Invite buttons
 * and the bottom-left Sound / Cloud icons live.  window.screen.width and
 * .height report the TRUE physical dimensions in CSS pixels regardless of
 * safe areas or browser chrome, so the container exactly fills the screen.
 * Math.max / Math.min extracts the landscape dimensions regardless of the
 * device's current physical orientation (screen.width/height are sometimes
 * swapped on Android when already landscape).
 *
 * ── Why this renders through a portal ────────────────────────────────────
 * The header uses position:fixed + backdrop-blur, which on real iOS/Android
 * Chrome creates its own compositor layer that can paint above sibling
 * fixed elements regardless of z-index whenever they share a stacking
 * context.  Portaling straight into <body> removes the overlay from that
 * stacking context entirely.  z-[10060] (above header 10000 and mobile
 * drawer 10050) does the rest.
 *
 * ── Hardware Back button ──────────────────────────────────────────────────
 * We push a synthetic history entry on mount and listen for popstate so
 * Back closes the overlay (rather than navigating the underlying page).
 *
 * ── Screen Wake Lock ──────────────────────────────────────────────────────
 * Touch events inside an iframe don't reset the host browser's idle timer,
 * so without a Wake Lock the phone screen turns off mid-game.  We request
 * a screen Wake Lock on mount and re-acquire it whenever the tab returns
 * to the foreground (the OS releases it automatically on tab-hide).
 */

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { RotateCcw, LogOut, UserPlus, Volume2, VolumeX, Check } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type OrientationType = "landscape" | "portrait";

interface MobileLandscapePlayerProps {
  /** The playable URL that goes into the iframe src. */
  playUrl?: string | null;
  /** Accessible iframe title. */
  title: string;
  /**
   * The game's native orientation.
   * "landscape" (default) → CSS-rotate the container when device is portrait.
   * "portrait"            → open overlay fullscreen without any rotation.
   */
  orientation?: OrientationType;
  /**
   * Called when the user taps the on-screen Exit button, presses the
   * hardware/browser Back button, presses Escape, or the embedded game
   * itself opts into our exit postMessage convention.
   */
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Width of the Exit / Invite / Mute control strip, in CSS px.
 *
 * Was 48 — wide enough that on real devices it sat on top of the embedded
 * game's own left-edge UI (horn button, turn-signal arrows, etc.) instead of
 * beside it, since the strip was absolutely positioned *over* a full-width
 * iframe. Two changes fix that together:
 *   1. This value is trimmed down to the minimum that still comfortably
 *      fits the 15–16px icon + rotated text label with tappable padding.
 *   2. The iframe is no longer full-width underneath the strip — it's
 *      inset by exactly this many pixels (see the game-area wrapper below),
 *      so the game's own canvas literally starts where this strip ends
 *      instead of being covered by it.
 */
const CONTROL_STRIP_WIDTH = 56;

/**
 * Diameter (CSS px) of each control-strip button. Sized to sit
 * comfortably inside CONTROL_STRIP_WIDTH with a few px of breathing room
 * on either side.
 */
const BUTTON_DIAMETER = 40;

/**
 * Builds an inline style object matching the muted, low-key HUD icon
 * badges shown in the reference screenshot (the game's own gear-shift /
 * tyre icons bottom-right): a small dark rounded-square badge, NOT a
 * bright glossy circle. Restrained in colour on purpose — the accent
 * colour only shows as a thin ring/edge when a button is in an "active"
 * state (e.g. muted), everything else stays a neutral graphite tone so
 * the strip doesn't compete with the game for attention.
 *
 * Still a genuine 3D button, just a subtler one:
 *   - soft diagonal gradient face (dark graphite, faint highlight top-left)
 *   - a thin solid "wall" beneath it for keycap thickness
 *   - a crisp 1px inset highlight along the top edge
 *   - a hairline border, brighter only when `active`
 *
 * `pressed` flattens the wall, inverts to an inner shadow, and nudges the
 * button down slightly — driven by onPointerDown/Up so it tracks touch,
 * mouse, and pen. This is purely cosmetic; it never gates the action
 * itself (see the Mute button below for why that separation matters).
 *
 * @param accent  This button's low-opacity accent colour (used only for
 *                the active-state ring/glow, kept subtle everywhere else)
 * @param pressed Whether the button is currently held down
 * @param active  Whether the button is in a toggled-on state (e.g. muted)
 */
function button3DStyle(
  accent: string,
  pressed: boolean,
  active: boolean = false
): React.CSSProperties {
  return {
    width: BUTTON_DIAMETER,
    height: BUTTON_DIAMETER,
    borderRadius: 11,
    background: pressed
      ? "linear-gradient(180deg, #202126 0%, #17181c 100%)"
      : "linear-gradient(160deg, #3a3c44 0%, #26272d 55%, #1b1c21 100%)",
    border: active
      ? `1.5px solid ${accent}`
      : "1px solid rgba(255,255,255,0.09)",
    boxShadow: pressed
      ? [
          "0 1px 0 rgba(0,0,0,0.55)",
          "0 1px 3px rgba(0,0,0,0.5)",
          "inset 0 2px 4px rgba(0,0,0,0.55)",
          "inset 0 -1px 1px rgba(255,255,255,0.05)",
        ].join(", ")
      : [
          "0 2px 0 rgba(0,0,0,0.5)",
          "0 3px 6px rgba(0,0,0,0.45)",
          active ? `0 0 0 3px ${accent}26` : "0 0 0 0 transparent",
          "inset 0 1px 0 rgba(255,255,255,0.16)",
          "inset 0 -3px 5px rgba(0,0,0,0.28)",
        ].join(", "),
    transform: pressed ? "translateY(2px) scale(0.96)" : "translateY(0) scale(1)",
    transition: "transform 60ms ease, box-shadow 60ms ease, border-color 60ms ease",
  };
}

/** True when the current viewport is taller than it is wide (portrait). */
function detectPortrait(): boolean {
  if (typeof window === "undefined") return true;
  return window.innerWidth < window.innerHeight;
}

/**
 * Returns { w, h } where w is always the LARGER (landscape) dimension and
 * h the SMALLER (portrait) dimension of the physical screen, regardless of
 * which way the device is oriented right now.
 */
function physicalScreenDims() {
  if (typeof window === "undefined") return { w: 844, h: 390 };
  const sw = window.screen.width;
  const sh = window.screen.height;
  return { w: Math.max(sw, sh), h: Math.min(sw, sh) };
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MobileLandscapePlayer({
  playUrl,
  title,
  orientation = "landscape",
  onClose,
}: MobileLandscapePlayerProps) {
  // SSR-safe guard — createPortal needs document.body to exist.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Physical screen dimensions for the CSS-rotation container (Layer 2).
  // Re-read on resize in case the browser changes its screen reporting
  // (rare but can happen on Android with display-mode changes).
  const [dims, setDims] = useState(physicalScreenDims);
  useEffect(() => {
    function measure() { setDims(physicalScreenDims()); }
    window.addEventListener("resize", measure, { passive: true });
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Whether the device is currently portrait-shaped.
  const [isPortrait, setIsPortrait] = useState<boolean>(detectPortrait);

  // True while the OS rotation animation is in flight (~500 ms after
  // orientationchange).  We delay updating isPortrait until the animation
  // finishes so the CSS transform doesn't snap mid-rotation.
  const [isRotating, setIsRotating] = useState(false);
  const rotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onOrientationChange() {
      if (rotTimerRef.current) clearTimeout(rotTimerRef.current);
      setIsRotating(true);
      rotTimerRef.current = setTimeout(() => {
        setIsPortrait(detectPortrait());
        setIsRotating(false);
      }, 500);
    }
    // orientationchange fires on mobile; resize catches desktop & fallback.
    window.addEventListener("orientationchange", onOrientationChange, { passive: true });
    window.addEventListener("resize", () => {
      if (!isRotating) setIsPortrait(detectPortrait());
    }, { passive: true });
    return () => {
      window.removeEventListener("orientationchange", onOrientationChange);
      if (rotTimerRef.current) clearTimeout(rotTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only CSS-rotate landscape games when the device is physically portrait.
  const needsRotation = orientation === "landscape" && isPortrait;

  // ── Exit / Invite / Mute control column ──────────────────────────────────
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [muted, setMuted] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  // Which strip button is currently being physically pressed, for the 3D
  // "pushed in" state. Pointer events (not click) so the depressed look
  // tracks the finger/cursor in real time on touch, mouse, and pen alike.
  const [pressedButton, setPressedButton] = useState<
    "exit" | "invite" | "mute" | null
  >(null);

  // Always-current mirror of `muted` for closures that outlive a single
  // render (the iframe's onLoad handler, retry timers) without having to
  // re-bind them on every toggle.
  const mutedRef = useRef(muted);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  /**
   * Posts the mute state into the iframe using every message shape we've
   * seen embedded HTML5 games listen for. This is inherently best-effort:
   * a cross-origin iframe's audio cannot be force-silenced from the parent
   * page (no DOM API for it, unlike <video>/<audio>) — see the file-level
   * "Mute" note. A game only actually goes quiet if its own code chooses
   * to listen for one of these. Broadcasting several conventions costs
   * nothing (games that don't recognise a shape just ignore it) and
   * measurably raises the odds of hitting whatever convention a given
   * embed does support.
   */
  function postMuteState(next: boolean) {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    const payloads: unknown[] = [
      { type: "mofigames:mute", muted: next },
      { type: next ? "mute" : "unmute" },
      { command: next ? "mute" : "unmute" },
      { eventName: next ? "mute" : "unmute" },
      next ? "mute" : "unmute",
    ];
    for (const payload of payloads) {
      try {
        win.postMessage(payload, "*");
      } catch {
        // Ignore — a hostile or torn-down iframe shouldn't break the UI.
      }
    }
  }

  /**
   * BUGFIX — this was the actual cause of "mute works once, then never
   * again": the old version read `const next = !muted;` out of the
   * render's closure and passed that fixed value straight into
   * `setMuted(next)`. Any stale copy of this function still floating
   * around (an unreleased pointer-capture retry, a delayed synthetic
   * mouse "click" firing after a pointerdown-based toggle, a memoised
   * ancestor, etc.) would keep computing `next` from whatever `muted`
   * was at the time THAT closure was created — so a second, stale
   * invocation could silently set state back to the same value the
   * first tap already produced, making every tap after the first a
   * no-op from the user's point of view.
   *
   * Using the functional updater form removes the closure dependency
   * entirely: React always hands the updater the true current state at
   * the moment it actually runs, so every tap toggles correctly no
   * matter what else queued the call or when it fires.
   */
  function handleMuteToggle() {
    setMuted((prev) => {
      const next = !prev;
      // Send now, then twice more shortly after — some games only attach
      // their message listener partway through their own startup sequence,
      // so a single message fired the instant the icon flips can arrive
      // before anyone is listening. Re-sending covers that race without
      // needing to know a given game's exact init timing.
      postMuteState(next);
      const t1 = setTimeout(() => postMuteState(mutedRef.current), 400);
      const t2 = setTimeout(() => postMuteState(mutedRef.current), 1500);
      // Best-effort cleanup if the player unmounts before the timers fire.
      setTimeout(() => clearTimeout(t1), 2000);
      setTimeout(() => clearTimeout(t2), 2000);
      return next;
    });
  }

  /**
   * Re-broadcasts the current mute state once the iframe finishes loading.
   * Covers the common case where the player taps Mute *before* the game
   * has finished initialising — the very first postMuteState() call above
   * would have had no listener to catch it yet.
   */
  function handleIframeLoad() {
    if (mutedRef.current) postMuteState(true);
  }

  async function handleInvite() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const shareData = { title: `Play ${title}`, text: `Come play ${title} with me!`, url };
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // User cancelled the native share sheet — nothing to do.
        return;
      }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard && url) {
      try {
        await navigator.clipboard.writeText(url);
        setInviteCopied(true);
        setTimeout(() => setInviteCopied(false), 1600);
      } catch {
        // Clipboard permission denied — silently ignore, nothing more we can do.
      }
    }
  }

  // ── Screen Wake Lock ─────────────────────────────────────────────────────
  // Keeps the display on while the game runs.  iframe touch events don't
  // reach the host browser's idle timer, so without this the screen dims.
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function acquireWakeLock() {
      if (!("wakeLock" in navigator)) return;
      try {
        const sentinel = await (navigator as Navigator & {
          wakeLock: { request: (type: "screen") => Promise<WakeLockSentinel> };
        }).wakeLock.request("screen");
        if (cancelled) { sentinel.release().catch(() => {}); return; }
        wakeLockRef.current = sentinel;
        // Re-acquire if the OS drops the lock (low battery, tab-hidden, etc.)
        sentinel.addEventListener("release", () => { if (!cancelled) acquireWakeLock(); });
      } catch {
        // Denied in low-battery mode or non-fullscreen contexts — acceptable.
      }
    }

    acquireWakeLock();

    function onVisibilityChange() {
      if (document.visibilityState === "visible") acquireWakeLock();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, []);

  // ── Native fullscreen + orientation lock (Layer 1) ───────────────────────
  useEffect(() => {
    const el = document.documentElement;

    const fsPromise: Promise<void> =
      el.requestFullscreen?.() ??
      (el as HTMLElement & { webkitRequestFullscreen?: () => void })
        .webkitRequestFullscreen?.() as unknown as Promise<void> ??
      Promise.resolve();

    Promise.resolve(fsPromise)
      .then(() => {
        if (orientation === "portrait") return;
        const so = screen?.orientation as
          | (ScreenOrientation & { lock?: (type: string) => Promise<void> })
          | undefined;
        return so?.lock?.("landscape");
      })
      .catch(() => {
        // Expected on iOS Safari.  CSS rotation (Layer 2) handles the fallback.
      });

    return () => {
      (screen?.orientation as (ScreenOrientation & { unlock?: () => void }) | undefined)
        ?.unlock?.();
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      } else if (
        (document as Document & { webkitFullscreenElement?: Element | null })
          .webkitFullscreenElement
      ) {
        (document as Document & { webkitExitFullscreen?: () => void })
          .webkitExitFullscreen?.();
      }
    };
  }, [orientation]);

  // ── Body scroll lock ─────────────────────────────────────────────────────
  useEffect(() => {
    const { overflow, position, width } = document.body.style;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed"; // iOS bounce-scroll guard
    document.body.style.width = "100%";
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.position = position;
      document.body.style.width = width;
    };
  }, []);

  // ── Escape key closes the overlay (developer convenience) ────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ── Hardware / browser Back button closes the overlay ───────────────────
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Listen for the embedded game opting into our exit convention (see
  // file-level "How the player is closed", path 2). Purely additive: our
  // own Exit button (in the control column below) is the guaranteed path
  // regardless of whether any given game sends this.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e.data;
      const isExit =
        data === "exit" ||
        (data && typeof data === "object" &&
          (data.type === "mofigames:exit" || data.type === "exit"));
      if (isExit) onCloseRef.current();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    window.history.pushState({ mobileGameOverlay: true }, "");
    let poppedByBack = false;

    function handlePopState() {
      poppedByBack = true;
      onCloseRef.current();
    }
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (!poppedByBack) window.history.back();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── CSS container dimensions (Layer 2) ───────────────────────────────────
  //
  // We use the TRUE physical screen dimensions from window.screen, not
  // dvh/dvw viewport units.  The difference matters on notched devices:
  //
  //   dvh in portrait  ≈  screen height − notch − home-indicator
  //                    = e.g. 844 px on iPhone 14 Pro (physical: 852 px)
  //
  // After rotating 90°, those 8 px of "missing" height become gaps on the
  // GAME'S LEFT and RIGHT edges — exactly where the Exit/Invite buttons
  // and the Sound/Cloud icons live.  window.screen.height gives 852 px, so
  // the container fills the entire physical display and edge UI is visible.
  //
  // Math.max/min normalises across devices that swap width/height when
  // already in landscape (common on Android).
  const gameContainerStyle: React.CSSProperties = needsRotation
    ? {
        // Landscape width  = the LARGER physical dimension (852 px on iPhone 14 Pro).
        // Landscape height = the SMALLER physical dimension (393 px).
        width: `${dims.w}px`,
        height: `${dims.h}px`,
        position: "absolute" as const,
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%) rotate(90deg)",
        transformOrigin: "center center",
        willChange: "transform",
        // No overflow:hidden — we need the game's edge UI to remain visible.
      }
    : {
        // Already landscape, or portrait game: fill the overlay as-is.
        position: "absolute" as const,
        inset: 0,
      };

  if (!mounted) return null;

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Playing ${title}`}
      // z-[10060] beats the header (10000) and mobile drawer (10050).
      // touchAction:none prevents the browser from stealing swipe events
      // while the game is running (e.g. pull-to-refresh, overscroll glow).
      className="fixed inset-0 z-[10060] bg-black"
      style={{ touchAction: "none" }}
    >
      {/* ── Rotatable game container (Layers 2 & 3) ───────────────────── */}
      <div style={gameContainerStyle}>

        {/* ── Game area ─────────────────────────────────────────────────
         * Inset from the left by exactly CONTROL_STRIP_WIDTH so the game's
         * own canvas starts precisely where the control strip ends, rather
         * than running full-width underneath it. Previously the iframe
         * filled the whole container and the strip sat on top as an
         * overlay, which meant every game's own left-edge UI (horn button,
         * turn-signal arrows, etc.) was partially hidden behind the strip.
         * With this inset, nothing is covered — the strip and the game
         * occupy separate, adjacent regions.
         */}
        <div
          className="absolute bottom-0 right-0 top-0"
          style={{ left: CONTROL_STRIP_WIDTH }}
        >
          {playUrl ? (
            <iframe
              ref={iframeRef}
              src={playUrl}
              title={title}
              className="h-full w-full border-0"
              allow="gamepad *; fullscreen *; autoplay *; accelerometer *; gyroscope *; camera *; microphone *"
              allowFullScreen
              onLoad={handleIframeLoad}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-white/60">
              <p className="text-sm">No game URL configured.</p>
            </div>
          )}
        </div>

        {/* ── Exit / Invite / Mute control panel ───────────────────────────
         * Edge-flush vertical sidebar pinned to the LEFT of the game
         * container, CONTROL_STRIP_WIDTH px wide — the game area above is
         * inset by that same amount, so the strip sits beside the game,
         * never on top of it. Fills the left safe-area strip (camera-notch
         * zone) with a solid black background top-to-bottom so no gap
         * shows through, but the three buttons themselves are grouped into
         * one tight cluster, vertically centred in the middle of the
         * strip — NOT one pinned to the extreme top edge and another to
         * the extreme bottom edge, which on a real device put Exit right
         * under the camera notch and Mute right against the home-indicator
         * zone, with a large dead gap between them:
         *
         *   ┌──────┐
         *   │      │  ← black, flexes to fill space above the cluster
         *   │  ⏻  │  ← Exit,   dark graphite rounded-square badge
         *   │  ➕  │  ← Invite, dark graphite rounded-square badge
         *   │  🔊  │  ← Mute,   dark graphite, thin red ring when muted
         *   │      │  ← black, flexes to fill space below the cluster
         *   └──────┘
         *
         * Restyled to match the reference screenshot's own in-game HUD
         * icons (the small dark gear-shift / tyre badges bottom-right of
         * the reference image) rather than looking like bright arcade
         * buttons: small rounded-square badges, low-saturation graphite
         * body, a subtle 3D bevel (gradient face + thin keycap "wall" +
         * inset top highlight — see button3DStyle) that flattens and
         * nudges down on press. Colour is used sparingly — only as a thin
         * accent ring on a button's active state (currently just Mute)
         * — so the strip stays visually quiet and doesn't compete with
         * the game itself. Labels were dropped in favour of icon +
         * aria-label: at this diameter a caption would crowd the badge.
         *
         * Lives INSIDE the rotated container so it lands in the correct
         * on-screen corner regardless of which rotation layer is active.
         * Root overlay has touchAction:none; this wrapper opts back into
         * normal touch handling so taps register correctly.
         *
         * Volume button specifics (see the full note further down):
         *   • onClick is the ONLY thing that toggles mute state — same
         *     proven pattern as Exit/Invite. touchAction:"manipulation"
         *     (set on every button here) is what actually removes the
         *     old 300ms mobile tap delay, so this is not a slower path —
         *     it's the one that reliably fires exactly once per tap.
         *   • onPointerDown/Up/Leave/Cancel are purely cosmetic — they
         *     only drive the pressed-in 3D look, never the action.
         *   • When muted, only the icon tints red and a thin red ring
         *     appears — the badge itself stays graphite, unlike before.
         */}
        <div
          className="absolute bottom-0 left-0 top-0 z-10 flex flex-col items-center"
          style={{
            width: CONTROL_STRIP_WIDTH,
            touchAction: "auto",
            background: "linear-gradient(180deg, #0c0c14 0%, #141420 40%, #141420 60%, #0c0c14 100%)",
            borderRight: "1px solid rgba(255,255,255,0.07)",
            boxShadow: "3px 0 14px rgba(0,0,0,0.55)",
          }}
        >
          {/* Spacer above the cluster */}
          <div style={{ flex: 1 }} />

          <div className="flex flex-col items-center" style={{ gap: 14 }}>
            {/* ── EXIT — violet/purple dome ───────────────────────────── */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              onPointerDown={(e) => { e.stopPropagation(); setPressedButton("exit"); }}
              onPointerUp={() => setPressedButton(null)}
              onPointerLeave={() => setPressedButton(null)}
              onPointerCancel={() => setPressedButton(null)}
              aria-label="Exit game"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                color: "#fff",
                cursor: "pointer",
                WebkitTapHighlightColor: "transparent",
                touchAction: "manipulation",
                userSelect: "none",
                flexShrink: 0,
                ...button3DStyle("#a855f7", pressedButton === "exit"),
              }}
            >
              <LogOut size={19} strokeWidth={2.2} />
            </button>

            {/* ── INVITE — cyan/teal dome ─────────────────────────────── */}
            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleInvite(); }}
                onPointerDown={(e) => { e.stopPropagation(); setPressedButton("invite"); }}
                onPointerUp={() => setPressedButton(null)}
                onPointerLeave={() => setPressedButton(null)}
                onPointerCancel={() => setPressedButton(null)}
                aria-label="Invite a friend"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                  color: "#fff",
                  cursor: "pointer",
                  WebkitTapHighlightColor: "transparent",
                  touchAction: "manipulation",
                  userSelect: "none",
                  flexShrink: 0,
                  ...button3DStyle("#10b981", pressedButton === "invite"),
                }}
              >
                {inviteCopied ? (
                  <Check size={19} strokeWidth={2.2} />
                ) : (
                  <UserPlus size={19} strokeWidth={2.2} />
                )}
              </button>

              {/* "Link copied" tooltip */}
              {inviteCopied && (
                <div
                  className="absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded-full bg-black/80 px-3 py-1.5 text-xs font-semibold text-white shadow-lg ring-1 ring-white/10"
                  aria-hidden="true"
                >
                  Link copied
                </div>
              )}
            </div>

            {/* ── VOLUME — neutral graphite badge, thin red ring when muted
             *
             *  ROOT CAUSE OF "works once, then stops" ───────────────────
             *  The previous version fired the actual toggle from
             *  onPointerDown instead of onClick (to dodge a legacy 300ms
             *  tap delay), while Exit/Invite correctly kept onClick as the
             *  action and onPointerDown as *only* the cosmetic "pressed"
             *  state. onPointerDown does NOT have the same one-tap-one-
             *  event guarantee onClick has: pointer capture, a
             *  pointerleave fired mid-press by the button's own
             *  translateY/scale press animation shifting it out from under
             *  the finger, or a delayed compatibility mouse/click event
             *  the browser still sends after a touch — any of these can
             *  fire (or fail to fire) independently of a real second tap,
             *  which is exactly what made the button feel "stuck" after
             *  the first press.
             *
             *  FIX: back to the same proven pattern as Exit/Invite — onClick
             *  is the ONLY thing that toggles state, so every tap maps to
             *  exactly one toggle, forever. This isn't slower: the strip
             *  already sets touchAction:"manipulation" on every button,
             *  which is what actually removes the old 300ms delay on every
             *  modern mobile browser — the click fires within a frame of
             *  the tap. onPointerDown/Up/Leave/Cancel are kept, but now do
             *  nothing except drive the visual "pressed" dome effect.
             */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleMuteToggle(); }}
              onPointerDown={(e) => { e.stopPropagation(); setPressedButton("mute"); }}
              onPointerUp={() => setPressedButton(null)}
              onPointerLeave={() => setPressedButton(null)}
              onPointerCancel={() => setPressedButton(null)}
              aria-label={muted ? "Unmute sound" : "Mute sound"}
              aria-pressed={muted}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                color: muted ? "#f87171" : "#e7e7ea",
                cursor: "pointer",
                WebkitTapHighlightColor: "transparent",
                touchAction: "manipulation",
                userSelect: "none",
                flexShrink: 0,
                // Same neutral graphite body as Exit/Invite at all times —
                // only a thin red ring (the `active` state) and the icon's
                // own colour communicate "muted", instead of flipping the
                // whole button to a loud solid red.
                ...button3DStyle("#ef4444", pressedButton === "mute", muted),
              }}
            >
              {muted ? <VolumeX size={18} strokeWidth={2.2} /> : <Volume2 size={18} strokeWidth={2.2} />}
            </button>
          </div>

          <div style={{ flex: 1 }} />
        </div>
      </div>

      {/* ── Rotation hint (Layer 2 only, fades after 1.8 s) ───────────── */}
      {needsRotation && !isRotating && <RotationHint />}
    </div>
  );

  return createPortal(overlay, document.body);
}

// ─── Rotation hint ────────────────────────────────────────────────────────────

function RotationHint() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 1800);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-10 z-20 flex justify-center"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 0.5s ease" }}
      aria-hidden="true"
    >
      <div className="flex items-center gap-2 rounded-full bg-black/75 px-5 py-2.5 text-xs font-medium text-white shadow-lg ring-1 ring-white/10 backdrop-blur-md">
        <RotateCcw size={13} className="shrink-0" aria-hidden />
        Rotate your device for the best experience
      </div>
    </div>
  );
}
