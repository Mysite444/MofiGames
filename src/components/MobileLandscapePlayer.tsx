"use client";

/**
 * MobileLandscapePlayer
 *
 * Full-screen game overlay for mobile.  A small host-rendered control strip
 * (Exit / Invite / Mute) is always visible at the BOTTOM of the physical
 * screen, adapting its shape and position to the current orientation state:
 *
 *   Portrait game on portrait device  → horizontal rail along the BOTTOM
 *     edge; buttons lie flat (wide × short) — `showBottomStrip`.
 *
 *   Landscape game CSS-rotated on portrait device  → vertical rail on the
 *     RIGHT edge of the rotated container; after rotate(90deg) CW, RIGHT
 *     maps to the physical BOTTOM — `showRightStrip`.
 *
 *   Any game on a landscape device  → vertical rail on the LEFT edge of
 *     the game canvas (original behaviour, unchanged).
 *
 * We build our own controls because we can't rely on every embedded game
 * shipping its own working Exit/Invite/Mute — and even when a game draws
 * its own Exit button, it has no way to reach through the iframe boundary
 * and close our overlay unless it speaks our postMessage convention.
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
 * (b) broadcasts our own uniquely-namespaced `{ type: "mofigames:mute",
 * muted }` postMessage on a best-effort basis, repeated on a short retry
 * and again once the iframe's `load` event fires, so a game whose own
 * listener attaches partway through its startup still catches it. This
 * mirrors how CrazyGames/Poki-style portals solve the same constraint —
 * the host defines the contract, the game opts in — but a given embed
 * only actually goes quiet if it happens to implement this exact
 * convention; that ceiling is a browser platform limitation, not
 * something fixable from the parent page.
 *
 * We deliberately do NOT also guess at generic message shapes a game
 * might recognise (bare "mute" strings, `{ command: "mute" }`, etc.).
 * That was tried and caused real damage: many third-party HTML5 games
 * (anything built against the GameDistribution SDK, for instance) wire
 * "mute" and "pause" to the same internal handler, and generic shapes are
 * exactly the kind a game's own listener might coincidentally match —
 * so broadcasting several guesses per tap could double-trigger a game's
 * own combined pause/mute toggle and drift it out of sync with our icon
 * (reported as "the third tap acts like a pause button"). Only our own
 * uniquely-namespaced message is sent now — nothing else lives inside
 * someone else's embed under that exact string, so it can't collide.
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
import { RotateCcw, ThumbsUp, ThumbsDown, Bookmark, Share2, MessageSquare } from "lucide-react";
import { toggleFavorite, useIsFavorited } from "@/lib/game-library";
import { formatPlays } from "@/lib/format-plays";
import { useMediaSessionCleanup } from "@/lib/use-media-session-cleanup";

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
   * Called when the hardware/browser Back button is pressed, Escape is hit,
   * or the embedded game opts into our exit postMessage convention.
   * (There is no longer an on-screen Exit button in the strip — the strip
   * now mirrors the post-page action row: Like / Dislike / Bookmark / Share /
   * Feedback.)
   */
  onClose: () => void;
  /**
   * Game slug — passed to useIsFavorited / toggleFavorite so the Bookmark
   * button in the strip stays in sync with the post-page bookmark state.
   */
  gameId: string;
  /**
   * Raw play count used to derive the like-count display (baseLikes =
   * round(basePlays × 0.92)), matching the formula on the post page.
   */
  basePlays: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Width (CSS px) of the vertical control strip (left/right edge strips).
 * Sized to fit the post-page action buttons at p-2 (8 px × 2 + 16 px icon =
 * 32 px face) with 6 px breathing room on each side.
 */
const CONTROL_STRIP_WIDTH = 44;

/**
 * Height (CSS px) of the horizontal control strip at the BOTTOM of the
 * screen in portrait mode.  Matches CONTROL_STRIP_WIDTH so the rail has
 * the same visual weight regardless of which edge it occupies.
 * Safe-area inset for the home indicator is added via CSS calc().
 */
const CONTROL_STRIP_HEIGHT = 44;

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
  gameId,
  basePlays,
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

  // ── Control-strip placement ───────────────────────────────────────────────
  //
  // There are three possible strip positions depending on orientation state:
  //
  //  showBottomStrip (portrait game on portrait device)
  //    No CSS rotation is applied. The overlay IS portrait, so the strip sits
  //    along the BOTTOM edge as a horizontal row of "lying" buttons — the most
  //    thumb-friendly position for one-handed portrait play.
  //
  //  showRightStrip (landscape game CSS-rotated on portrait device)
  //    The game container is rotated 90° clockwise.  Under that transform:
  //      container's LEFT  → physical TOP  (wrong for controls)
  //      container's RIGHT → physical BOTTOM  ← desired
  //    Moving the strip to the container's RIGHT edge therefore makes it appear
  //    at the PHYSICAL BOTTOM of the portrait screen — the same goal as
  //    showBottomStrip, but achieved through container-coordinate remapping
  //    rather than explicit layout changes.  The buttons stay in their vertical
  //    layout; the 90° rotation makes them LOOK horizontal to the user.
  //
  //  default — LEFT strip (landscape device, any orientation)
  //    Original behaviour: strip along the LEFT edge of the game canvas.
  //
  const showBottomStrip = !needsRotation && isPortrait;
  const showRightStrip  = needsRotation; // LEFT in rotated container ≡ physical BOTTOM

  // Precomputed className + style for the game area div and the strip div so
  // the JSX stays readable.
  const gameAreaClass = showBottomStrip
    ? "absolute left-0 right-0 top-0"
    : showRightStrip
    ? "absolute bottom-0 left-0 top-0"
    : "absolute bottom-0 right-0 top-0";

  const gameAreaStyle: React.CSSProperties = showBottomStrip
    ? { bottom: `calc(${CONTROL_STRIP_HEIGHT}px + env(safe-area-inset-bottom, 0px))` }
    : showRightStrip
    ? { right: CONTROL_STRIP_WIDTH }
    : { left: CONTROL_STRIP_WIDTH };

  const stripClass = showBottomStrip
    ? "absolute bottom-0 left-0 right-0 z-10 flex flex-row items-center"
    : showRightStrip
    ? "absolute bottom-0 right-0 top-0 z-10 flex flex-col items-center"
    : "absolute bottom-0 left-0 top-0 z-10 flex flex-col items-center";

  const stripStyle: React.CSSProperties = showBottomStrip
    ? {
        // Total visual height = content rail + home-indicator safe area.
        // With box-sizing:border-box (Tailwind default) height includes the
        // paddingBottom, so the CONTENT area stays CONTROL_STRIP_HEIGHT px
        // while the strip background extends down to cover the home indicator.
        height: `calc(${CONTROL_STRIP_HEIGHT}px + env(safe-area-inset-bottom, 0px))`,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        touchAction: "auto",
        background: "#000",
        borderTop: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "0 -3px 12px rgba(0,0,0,0.60)",
      }
    : {
        width: CONTROL_STRIP_WIDTH,
        touchAction: "auto",
        background: "#000",
        ...(showRightStrip
          ? {
              borderLeft:  "1px solid rgba(255,255,255,0.10)",
              boxShadow:   "-3px 0 12px rgba(0,0,0,0.60)",
            }
          : {
              borderRight: "1px solid rgba(255,255,255,0.10)",
              boxShadow:   "3px 0 12px rgba(0,0,0,0.60)",
            }),
      };

  // ── Action-bar state — mirrors the mobile game-post action row ───────────
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Like / Dislike — optimistic, local-only (no backend yet), same as the
  // post page. Resets when the overlay unmounts (per-session intent is fine).
  const [vote, setVote] = useState<"up" | "down" | null>(null);

  // Bookmark — backed by localStorage via lib/game-library so it stays in
  // sync with the post-page Bookmark button and the /favorites page.
  const favorited = useIsFavorited(gameId);

  // Like count: same formula as the post page (baseLikes = plays × 0.92).
  const baseLikes = Math.round(basePlays * 0.92);

  /** Share the current game page via the native share sheet or clipboard. */
  async function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (typeof navigator !== "undefined" && navigator.share) {
      try { await navigator.share({ title: `Play ${title}`, url }); } catch {}
      return;
    }
    if (typeof navigator !== "undefined" && navigator.clipboard && url) {
      try { await navigator.clipboard.writeText(url); } catch {}
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

  // ── Media Session cleanup ─────────────────────────────────────────────────
  // This overlay only exists while `playing` is true (see MobileGamePage),
  // so its mount/unmount lifecycle IS the game's play/close lifecycle —
  // exactly where the persistent Android Chrome media-notification bug
  // showed up. Resets the Media Session on unmount (Exit tapped, Back
  // pressed, or navigating away entirely) and on visibilitychange → hidden
  // (tab switched away from or closed). See lib/use-media-session-cleanup.ts.
  useMediaSessionCleanup();

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
         * Inset away from whichever edge the control strip occupies so the
         * game canvas starts precisely where the strip ends and nothing is
         * ever hidden behind it:
         *   • portrait game on portrait device  → inset from BOTTOM
         *   • landscape game CSS-rotated        → inset from RIGHT
         *                                         (RIGHT in container = BOTTOM
         *                                          of physical portrait screen
         *                                          after rotate(90deg) CW)
         *   • landscape device (any game)       → inset from LEFT (original)
         */}
        <div
          className={gameAreaClass}
          style={gameAreaStyle}
        >
          {playUrl ? (
            <iframe
              ref={iframeRef}
              src={playUrl}
              title={title}
              className="h-full w-full border-0"
              // NOTE on Media Session: "media session" is not a
              // Permissions-Policy-controlled feature, so — unlike
              // autoplay/fullscreen/gamepad below — there's no `allow`
              // directive that can restrict it from here. Cross-origin
              // isolation already confines this game's own
              // `navigator.mediaSession` writes to its own document; the
              // fix for the stuck Android Chrome notification is clearing
              // THIS page's Media Session on close, via
              // useMediaSessionCleanup() above.
              allow="gamepad *; fullscreen *; autoplay *; accelerometer *; gyroscope *; camera *; microphone *"
              allowFullScreen
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-white/60">
              <p className="text-sm">No game URL configured.</p>
            </div>
          )}
        </div>

        {/* ── Action strip — mirrors the mobile game-post action row ─────────
         *
         * Buttons are pixel-identical to the Like / Dislike / Bookmark /
         * Share / Feedback row on the game post page:
         *   • rounded-lg border bg-black, white text at rest
         *   • border-white/40 → border-white/70 on hover
         *   • Like:     ThumbsUp + live count; fill-white when voted up
         *   • Dislike:  ThumbsDown icon-only; fill-white when voted down
         *   • Bookmark: blue border + fill when favorited (border-[#3DA9FC]/60)
         *   • Share:    native share sheet or clipboard fallback
         *   • Feedback: opens /contact in a new tab
         *
         * Three strip positions (set by precomputed stripClass/stripStyle):
         *   showBottomStrip → horizontal row at physical BOTTOM (portrait game)
         *   showRightStrip  → vertical column on RIGHT of rotated container
         *                     (appears at physical BOTTOM after rotate(90deg))
         *   default         → vertical column on LEFT (landscape device)
         *
         * Root overlay has touchAction:none; this wrapper's touchAction:auto
         * (in stripStyle) opts the strip back into normal tap handling.
         */}
        <div
          className={stripClass}
          style={stripStyle}
        >
          {showBottomStrip ? (
            /* ── Horizontal layout (portrait game, portrait device) ──────── */
            <div className="flex flex-1 flex-row items-center justify-evenly px-2">

              {/* Like — wider pill with count, matching the post page exactly */}
              <button
                type="button"
                onClick={() => setVote((v) => (v === "up" ? null : "up"))}
                aria-pressed={vote === "up"}
                aria-label="Like"
                className={`flex shrink-0 items-center gap-1.5 rounded-lg border bg-black px-3 py-1.5 text-xs font-semibold transition-colors ${
                  vote === "up"
                    ? "border-white/70 text-white"
                    : "border-white/40 text-white hover:border-white/70"
                }`}
              >
                <ThumbsUp size={13} className={vote === "up" ? "fill-white" : ""} />
                {formatPlays(baseLikes + (vote === "up" ? 1 : 0))}
              </button>

              {/* Dislike — icon-only square */}
              <button
                type="button"
                onClick={() => setVote((v) => (v === "down" ? null : "down"))}
                aria-pressed={vote === "down"}
                aria-label="Dislike"
                className="flex shrink-0 items-center justify-center rounded-lg border border-white/40 bg-black p-2 text-white transition-colors hover:border-white/70"
              >
                <ThumbsDown size={13} className={vote === "down" ? "fill-white" : ""} />
              </button>

              {/* Bookmark — blue accent when favorited, backed by localStorage */}
              <button
                type="button"
                onClick={() => toggleFavorite(gameId)}
                aria-pressed={favorited}
                aria-label={favorited ? "Remove bookmark" : "Bookmark game"}
                className={`flex shrink-0 items-center justify-center rounded-lg border bg-black p-2 transition-colors hover:border-white/70 ${
                  favorited ? "border-[#3DA9FC]/60 text-[#3DA9FC]" : "border-white/40 text-white"
                }`}
              >
                <Bookmark size={13} className={favorited ? "fill-[#3DA9FC]" : ""} />
              </button>

              {/* Share — native share sheet → clipboard fallback */}
              <button
                type="button"
                onClick={handleShare}
                aria-label="Share"
                className="flex shrink-0 items-center justify-center rounded-lg border border-white/40 bg-black p-2 text-white transition-colors hover:border-white/70"
              >
                <Share2 size={13} />
              </button>

              {/* Feedback — opens /contact in a new tab so the game keeps running */}
              <button
                type="button"
                onClick={() => window.open("/contact", "_blank", "noopener")}
                aria-label="Send feedback"
                className="flex shrink-0 items-center justify-center rounded-lg border border-white/40 bg-black p-2 text-white transition-colors hover:border-white/70"
              >
                <MessageSquare size={13} />
              </button>
            </div>
          ) : (
            /* ── Vertical layout (left / right strips — landscape device or
             *    CSS-rotated landscape game on portrait device)
             *    All buttons are icon-only so they fit in the narrow rail.
             *    After rotate(90deg) CW (showRightStrip), the column appears
             *    horizontally at the physical bottom of the portrait screen.
             */
            <div
              className="flex flex-1 flex-col items-center justify-center gap-1.5"
              style={{ paddingTop: 6, paddingBottom: 6 }}
            >
              {/* Like */}
              <button
                type="button"
                onClick={() => setVote((v) => (v === "up" ? null : "up"))}
                aria-pressed={vote === "up"}
                aria-label="Like"
                className={`flex items-center justify-center rounded-lg border bg-black p-2 transition-colors ${
                  vote === "up"
                    ? "border-white/70 text-white"
                    : "border-white/40 text-white hover:border-white/70"
                }`}
              >
                <ThumbsUp size={13} className={vote === "up" ? "fill-white" : ""} />
              </button>

              {/* Dislike */}
              <button
                type="button"
                onClick={() => setVote((v) => (v === "down" ? null : "down"))}
                aria-pressed={vote === "down"}
                aria-label="Dislike"
                className="flex items-center justify-center rounded-lg border border-white/40 bg-black p-2 text-white transition-colors hover:border-white/70"
              >
                <ThumbsDown size={13} className={vote === "down" ? "fill-white" : ""} />
              </button>

              {/* Bookmark */}
              <button
                type="button"
                onClick={() => toggleFavorite(gameId)}
                aria-pressed={favorited}
                aria-label={favorited ? "Remove bookmark" : "Bookmark game"}
                className={`flex items-center justify-center rounded-lg border bg-black p-2 transition-colors hover:border-white/70 ${
                  favorited ? "border-[#3DA9FC]/60 text-[#3DA9FC]" : "border-white/40 text-white"
                }`}
              >
                <Bookmark size={13} className={favorited ? "fill-[#3DA9FC]" : ""} />
              </button>

              {/* Share */}
              <button
                type="button"
                onClick={handleShare}
                aria-label="Share"
                className="flex items-center justify-center rounded-lg border border-white/40 bg-black p-2 text-white transition-colors hover:border-white/70"
              >
                <Share2 size={13} />
              </button>

              {/* Feedback */}
              <button
                type="button"
                onClick={() => window.open("/contact", "_blank", "noopener")}
                aria-label="Send feedback"
                className="flex items-center justify-center rounded-lg border border-white/40 bg-black p-2 text-white transition-colors hover:border-white/70"
              >
                <MessageSquare size={13} />
              </button>
            </div>
          )}
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
