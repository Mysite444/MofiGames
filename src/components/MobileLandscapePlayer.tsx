"use client";

/**
 * MobileLandscapePlayer
 *
 * Full-screen landscape game overlay for mobile — mirrors the CrazyGames
 * behaviour where tapping Play immediately locks the experience to landscape
 * without requiring the user to physically rotate the device.
 *
 * Three-layer strategy (each fallback is transparent to the user):
 *
 *  Layer 1 — Native fullscreen + orientation lock (Android Chrome / modern
 *             Chromium browsers):
 *    requestFullscreen() → then screen.orientation.lock("landscape")
 *    The browser chrome disappears and the OS rotates its own UI.
 *
 *  Layer 2 — CSS rotation fallback (iOS Safari, browsers that don't support
 *             the Orientation Lock API, or any context that isn't fullscreen):
 *    The inner game container gets `transform: rotate(90deg)` with swapped
 *    width/height (100dvh × 100dvw) so it visually fills the screen in
 *    landscape even though the device is physically portrait.  The iframe
 *    itself still receives landscape dimensions and plays correctly.
 *
 *  Layer 3 — Natural landscape (device is already landscape or the game's
 *             native orientation is portrait):
 *    No rotation needed; the overlay just fills the screen as-is.
 *
 * Close (✕) button lives *inside* the rotated container so it always appears
 * in the top-right corner of the game coordinate space regardless of which
 * layer is active or what the physical device orientation is.
 *
 * ── Why this renders through a portal ──────────────────────────────────
 * Same reason as MobileDrawer / MobileActionSheet: the header is `position:
 * fixed` + `backdrop-blur`, which on real mobile Safari/Chrome (not desktop
 * DevTools emulation) gets promoted to its own compositing layer that can
 * paint above sibling `fixed` elements *regardless of z-index* once it
 * shares an ancestor stacking context with them. This overlay is rendered
 * deep inside <main>, a sibling of <Header>, so it was exactly that case —
 * the header (hamburger/search/notifications/account) kept showing on top
 * of the "fullscreen" game even though its z-index (9999) was below the
 * header's (10000) on paper. Portaling straight into <body>, plus using a
 * z-index above every other fixed layer in the app (header 10000, mobile
 * drawer/action-sheet 10050), removes it from that stacking context so it
 * always wins.
 *
 * ── Hardware / browser Back button ─────────────────────────────────────
 * Tapping ✕ or pressing Escape already closed the overlay, but the Back
 * button (Android hardware/gesture back, iOS edge-swipe, or the browser's
 * own Back control) did nothing special — it would fall through to normal
 * history navigation and leave the game running, fullscreen/orientation
 * lock and all. We push a synthetic history entry while the overlay is
 * open and listen for `popstate` so Back closes the overlay first (which
 * unmounts this component and — via the effect below — exits fullscreen
 * and unlocks the orientation, returning the device to portrait) instead
 * of navigating the underlying page.
 *
 * ── Screen Wake Lock ────────────────────────────────────────────────────
 * Mobile browsers (Android Chrome, Samsung Internet, newer Safari) will
 * dim and lock the screen after the device's idle timeout even while a
 * game is running inside an iframe, because touch events inside the iframe
 * don't reset the browser's own idle timer. We request a Screen Wake Lock
 * the moment the overlay opens so the display stays on for the entire
 * gameplay session. The lock is released (and re-requested on tab return)
 * automatically in the cleanup / visibility-change handlers.
 *
 * ── X button visibility during rotation ────────────────────────────────
 * When the OS or CSS animates the device rotation the close button can
 * flash at a wrong position mid-animation. We track a short `isRotating`
 * window (~500 ms) around every `orientationchange` event and suppress the
 * button during that window. After the animation the button re-appears via
 * the auto-show / tap-to-reveal system, so the user is never left without
 * a way to exit.
 *
 * The close button itself auto-hides 3 s after the overlay opens (or after
 * the last tap anywhere on the overlay), matching the Netflix / YouTube
 * fullscreen UX. Tapping the game surface re-shows it for another 3 s.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, RotateCcw } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type OrientationType = "landscape" | "portrait";

interface MobileLandscapePlayerProps {
  /** The playable URL that goes into the iframe `src`. */
  playUrl?: string | null;
  /** Accessible iframe title. */
  title: string;
  /**
   * The game's native orientation (game.orientation from the DB).
   * - "landscape" (default) → rotate when the device is portrait.
   * - "portrait" → the game is designed for portrait; skip rotation,
   *   just open the overlay fullscreen.
   */
  orientation?: OrientationType;
  /**
   * Called when the user taps the ✕ button, presses Escape, or presses the
   * hardware/browser Back button (intercepted internally via `popstate`).
   */
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** True when the viewport is currently taller than it is wide (portrait). */
function detectPortrait(): boolean {
  if (typeof window === "undefined") return true;
  return window.innerWidth < window.innerHeight;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MobileLandscapePlayer({
  playUrl,
  title,
  orientation = "landscape",
  onClose,
}: MobileLandscapePlayerProps) {
  // SSR-safe "can we use document.body yet" guard — same pattern as
  // MobileDrawer/MobileActionSheet — required before calling createPortal.
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  // Whether the physical viewport is currently portrait-shaped.
  const [isPortrait, setIsPortrait] = useState<boolean>(detectPortrait);

  // Only rotate landscape games when the device is in portrait.
  // Portrait games fill the screen naturally (no rotation needed).
  const needsRotation = orientation === "landscape" && isPortrait;

  // ── Screen Wake Lock ─────────────────────────────────────────────────────
  // Prevents the phone display from dimming / locking while a game is
  // running. iframe touch events don't reset the browser's idle timer, so
  // without this the screen turns off mid-game on real devices.
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function acquireWakeLock() {
      // Guard: the API is not available in all browsers (Firefox < 126,
      // iOS Safari < 16.4 without the flag, some webviews).
      if (!("wakeLock" in navigator)) return;
      try {
        const sentinel = await (navigator as Navigator & {
          wakeLock: { request: (type: "screen") => Promise<WakeLockSentinel> };
        }).wakeLock.request("screen");
        if (cancelled) {
          // Component unmounted between the async request and the resolve.
          sentinel.release().catch(() => {});
          return;
        }
        wakeLockRef.current = sentinel;

        // The OS automatically releases the lock when the tab is hidden
        // (e.g. user switches apps). Re-acquire when the tab comes back
        // so the screen stays on when they return to the game.
        sentinel.addEventListener("release", () => {
          if (!cancelled) acquireWakeLock();
        });
      } catch {
        // Expected in low-battery mode, in some PWA contexts, and in
        // browsers that support the API but deny non-fullscreen requests.
        // CSS rotation (Layer 2) still makes the game playable; we just
        // can't guarantee the screen stays on.
      }
    }

    acquireWakeLock();

    // Re-acquire when the tab becomes visible again (visibility-change
    // releases the sentinel automatically per the spec).
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") acquireWakeLock();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, []);

  // ── Auto-hide / tap-to-reveal close button ───────────────────────────────
  // Show the close button on mount, then fade it out after 3 s. Tapping
  // anywhere on the overlay resets the 3 s timer and shows it again. This
  // matches the Netflix / YouTube fullscreen UX and keeps the game UI clean.
  const [showControls, setShowControls] = useState(true);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable callback — wrapped in useCallback with no deps so the reference
  // never changes; the orientationchange effect below safely captures it.
  const showControlsBriefly = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  // Keep a ref so the orientationchange effect (which runs once on mount)
  // always calls the latest version of showControlsBriefly — identical to
  // the onCloseRef pattern used for the Back-button handler below.
  const showControlsBrieflyRef = useRef(showControlsBriefly);
  useEffect(() => { showControlsBrieflyRef.current = showControlsBriefly; }, [showControlsBriefly]);

  // ── Orientation change — hide X button while the rotation animates ────────
  // When the OS rotates the screen (or when we trigger the CSS rotation by
  // `isPortrait` flipping) the close button jumps to a wrong position for
  // ~300–500 ms. We track a short "rotating" window and hide the button
  // during it; once the animation is done the button reappears through the
  // auto-show system above.
  const [isRotating, setIsRotating] = useState(false);
  const rotatingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleOrientationChange() {
      // Clear any previous timer so rapid flips don't double-fire.
      if (rotatingTimerRef.current) clearTimeout(rotatingTimerRef.current);
      setIsRotating(true);

      // 500 ms covers both the native OS rotation animation and the CSS
      // transform transition on the game container.  After that, sync the
      // portrait state and re-show the controls.
      rotatingTimerRef.current = setTimeout(() => {
        setIsPortrait(detectPortrait());
        setIsRotating(false);
        // Re-show controls so the user can find the exit button after rotating.
        showControlsBrieflyRef.current();
      }, 500);
    }

    window.addEventListener("orientationchange", handleOrientationChange, { passive: true });
    return () => {
      window.removeEventListener("orientationchange", handleOrientationChange);
      if (rotatingTimerRef.current) clearTimeout(rotatingTimerRef.current);
    };
    // Intentionally empty — runs once on mount. showControlsBrieflyRef is a
    // ref, so changes to showControlsBriefly don't need to re-register the
    // event listener (same pattern as onCloseRef / handlePopState below).
  }, []);

  // Start the initial auto-hide timer when the overlay mounts.
  useEffect(() => {
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, []);

  // ── Orientation listener (resize fallback) ───────────────────────────────
  // "resize" catches orientation changes on desktop and any browser where
  // "orientationchange" doesn't fire reliably.  We deliberately separate
  // this from the orientationchange handler: resize fires continuously while
  // dragging a window, so we never set isRotating=true here — only the
  // dedicated orientationchange event (above) triggers the hide window.
  useEffect(() => {
    function sync() {
      // Only update isPortrait if we're NOT already in the rotating window;
      // otherwise the orientationchange handler will do it after the timeout.
      setIsPortrait(detectPortrait());
    }
    window.addEventListener("resize", sync, { passive: true });
    return () => window.removeEventListener("resize", sync);
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
          | (ScreenOrientation & {
              lock?: (type: string) => Promise<void>;
            })
          | undefined;
        return so?.lock?.("landscape");
      })
      .catch(() => {
        // Expected on iOS Safari and on any browser that requires a user
        // gesture + fullscreen before allowing orientation lock.
        // CSS rotation (Layer 2) handles the fallback transparently.
      });

    return () => {
      const so = screen?.orientation as
        | (ScreenOrientation & { unlock?: () => void })
        | undefined;
      so?.unlock?.();

      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      } else if (
        (
          document as Document & {
            webkitFullscreenElement?: Element | null;
            webkitExitFullscreen?: () => void;
          }
        ).webkitFullscreenElement
      ) {
        (
          document as Document & { webkitExitFullscreen?: () => void }
        ).webkitExitFullscreen?.();
      }
    };
  }, [orientation]);

  // ── Body scroll lock ─────────────────────────────────────────────────────
  useEffect(() => {
    const prev = document.body.style.overflow;
    const prevPosition = document.body.style.position;
    const prevWidth = document.body.style.width;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.width = "100%";
    return () => {
      document.body.style.overflow = prev;
      document.body.style.position = prevPosition;
      document.body.style.width = prevWidth;
    };
  }, []);

  // ── Escape key to close ──────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ── Hardware / browser Back button closes the overlay ───────────────────
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    window.history.pushState({ mobileGameOverlay: true }, "");
    let poppedByBackButton = false;

    function handlePopState() {
      poppedByBackButton = true;
      onCloseRef.current();
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (!poppedByBackButton) {
        window.history.back();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── CSS dimensions for the rotated game container (Layer 2) ─────────────
  const gameContainerStyle: React.CSSProperties = needsRotation
    ? {
        width: "100dvh",
        height: "100dvw",
        // @ts-ignore
        maxWidth: "100vh",
        maxHeight: "100vw",
        position: "absolute" as const,
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%) rotate(90deg)",
        transformOrigin: "center center",
        willChange: "transform",
        overflow: "hidden",
      }
    : {
        position: "absolute" as const,
        inset: 0,
        overflow: "hidden",
      };

  if (!mounted) return null;

  // Whether the close button should be visible right now:
  //   • Always hidden while the rotation animation is playing (isRotating)
  //   • Otherwise follows the auto-hide / tap-to-reveal state (showControls)
  const closeButtonVisible = !isRotating && showControls;

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Playing ${title}`}
      className="fixed inset-0 z-[10060] bg-black"
      style={{ touchAction: "none" }}
      // Tap anywhere on the overlay (outside the iframe) to re-show controls.
      onPointerDown={showControlsBriefly}
    >
      {/* ── Rotatable game container ───────────────────────────────────── */}
      <div style={gameContainerStyle}>

        {/* ── Close button ─────────────────────────────────────────────── */}
        {/*
         * Visibility is driven by `closeButtonVisible`:
         *   - Hidden during orientation-change animation (isRotating=true)
         *     so the button doesn't flash at a wrong position mid-rotation.
         *   - Auto-hides 3 s after mount / last tap for a clean game view.
         *   - Tapping anywhere on the overlay (onPointerDown above) re-shows
         *     it, so the user is never permanently stuck without an exit.
         * Using opacity + pointer-events rather than conditional rendering so
         * the button's DOM node is always present for accessibility tools;
         * aria-hidden keeps screen readers from announcing it while hidden.
         */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Exit game"
          aria-hidden={!closeButtonVisible}
          tabIndex={closeButtonVisible ? 0 : -1}
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white shadow-lg ring-1 ring-white/10 backdrop-blur-sm"
          style={{
            touchAction: "auto",
            opacity: closeButtonVisible ? 1 : 0,
            pointerEvents: closeButtonVisible ? "auto" : "none",
            transition: "opacity 0.25s ease",
          }}
        >
          <X size={18} strokeWidth={2.5} />
        </button>

        {/* ── Game iframe ──────────────────────────────────────────────── */}
        {playUrl ? (
          <iframe
            src={playUrl}
            title={title}
            className="h-full w-full border-0"
            allow="gamepad *; fullscreen *; autoplay *; accelerometer *; gyroscope *; camera *; microphone *"
            allowFullScreen
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-white/60">
            <X size={32} className="text-white/20" />
            <p className="text-sm">No game URL configured.</p>
          </div>
        )}
      </div>

      {/* ── Rotation hint (Layer 2 only) ───────────────────────────────── */}
      {needsRotation && !isRotating && <RotationHint />}
    </div>
  );

  return createPortal(overlay, document.body);
}

// ─── Rotation hint ────────────────────────────────────────────────────────────

function RotationHint() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setVisible(false), 1800);
    return () => clearTimeout(fadeTimer);
  }, []);

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-10 z-20 flex justify-center"
      style={{
        opacity: visible ? 1 : 0,
        transition: "opacity 0.5s ease",
      }}
      aria-hidden="true"
    >
      <div className="flex items-center gap-2 rounded-full bg-black/75 px-5 py-2.5 text-xs font-medium text-white shadow-lg ring-1 ring-white/10 backdrop-blur-md">
        <RotateCcw size={13} className="shrink-0" aria-hidden />
        Rotate your device for the best experience
      </div>
    </div>
  );
}
