"use client";

/**
 * MobileLandscapePlayer
 *
 * Full-screen landscape game overlay for mobile.  No wrapper chrome is
 * rendered on top of the game — no close button, no overlay controls.
 * The game runs with its own native UI (Exit, Invite, Sound, etc.) fully
 * visible, exactly as shown in the reference screenshot.
 *
 * ── How the player is closed ─────────────────────────────────────────────
 * Three paths, all of which unmount this component and return the user to
 * the game-page UI:
 *   1. The game's own "Exit" button — the iframe posts a postMessage or the
 *      user simply uses the in-game control.  Because the overlay has no
 *      close button of its own, the game dictates when to exit.
 *   2. Hardware / browser Back (Android gesture, iOS edge-swipe, browser
 *      chrome ← button) — intercepted via a synthetic `history.pushState`
 *      + `popstate` listener so Back closes the overlay first instead of
 *      navigating off the game page.
 *   3. Keyboard Escape — developer convenience on desktop.
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
import { RotateCcw } from "lucide-react";

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
   * Called when the user presses the hardware/browser Back button or Escape.
   * There is no on-screen close button — the game provides its own Exit UI.
   */
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

        {/* ── Game iframe ──────────────────────────────────────────────── */}
        {playUrl ? (
          <iframe
            src={playUrl}
            title={title}
            // Fill the entire container — the container's size and rotation
            // handle all the layout math; the iframe just fills 100 × 100.
            className="h-full w-full border-0"
            allow="gamepad *; fullscreen *; autoplay *; accelerometer *; gyroscope *; camera *; microphone *"
            allowFullScreen
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-white/60">
            <p className="text-sm">No game URL configured.</p>
          </div>
        )}
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
