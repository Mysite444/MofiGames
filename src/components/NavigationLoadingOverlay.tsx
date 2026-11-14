"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// How long a navigation must be "in flight" before anything is drawn.
// Prefetched / cached hops (and most back/forward moves) land before this
// fires, so they show no indicator at all.
const SHOW_DELAY_MS = 150;

// Once the bar has appeared it stays at least this long, so it never flashes
// for a single frame on a navigation that is only slightly slow.
const MIN_VISIBLE_MS = 200;

// How long the "complete + fade out" animation takes (matches the CSS).
const FINISH_MS = 260;

// Hard ceiling on how long the bar may stay up. 0 means "never show the
// indicator at all" (start() bails out below). Raise it (e.g. 5_000) to
// bring the progress bar back.
const SAFETY_TIMEOUT_MS = 0;

type Phase = "idle" | "loading" | "finishing";

/**
 * Site-wide navigation indicator: a slim progress bar pinned to the top of
 * the viewport.
 *
 * Why a bar and not a spinner overlay:
 *   - The previous version dimmed the whole page and set pointer-events:none
 *     on it while a navigation was pending (up to a 10 s ceiling). That made
 *     every slow hop feel like the site had frozen — the user could not click
 *     anything, could not change their mind, and saw a second "loading" UI on
 *     top of the route's own loading.tsx skeleton.
 *   - This one never blocks input and never touches page content. The route
 *     skeletons (loading.tsx) remain the primary "something is loading" cue;
 *     the bar is just a subtle confirmation that the click was registered.
 *
 * What starts it:
 *   - A plain left-click on a same-origin <a> that points somewhere else.
 *   - `popstate`, i.e. the browser Back / Forward buttons (the previous
 *     version ignored these entirely, so history navigation had no feedback).
 *
 * What stops it: the route actually changing (pathname / search params), the
 * safety timeout, or the page being hidden / restored (see below).
 *
 * Back/forward cache (bfcache) — why `pagehide` / `pageshow` are handled:
 *   When a click turns into a real document navigation (prerender activation,
 *   an RSC fetch that falls back to a full page load, …), mobile Chrome and
 *   Safari freeze the page we are leaving into the bfcache exactly as it is —
 *   DOM, React state and half-run timers included. Pressing Back later thaws
 *   that frozen page, no route change happens (nothing for the effect below
 *   to react to), and the indicator that was up at freeze time is simply
 *   still there, now waiting out whatever is left of the safety timeout. (With
 *   the previous full-page dimming overlay and its 10 s ceiling, that showed
 *   up as a dimmed, spinner-covered homepage for several seconds after Back.)
 *   So a page that is going away is always put back to idle before it is
 *   frozen, and a page that comes back from the bfcache is reset again on
 *   `pageshow`.
 *
 * Self-contained (no context/provider). Mounted once in the root layout
 * inside a <Suspense> boundary (required for useSearchParams).
 */
export function NavigationLoadingOverlay() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<Phase>("idle");
  const rootRef = useRef<HTMLDivElement>(null);

  const phaseRef = useRef<Phase>("idle");
  const shownAtRef = useRef(0);
  // True between "navigation detected" and "navigation finished", including
  // the SHOW_DELAY_MS window in which nothing is visible yet.
  const activeRef = useRef(false);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentKeyRef = useRef("");

  // Stable function refs so the global listeners never go stale and the
  // route-change effect can call them without re-subscribing anything.
  const startRef = useRef<() => void>(() => {});
  const finishRef = useRef<() => void>(() => {});

  const searchString = searchParams?.toString() ?? "";

  useEffect(() => {
    currentKeyRef.current = searchString ? `${pathname}?${searchString}` : (pathname ?? "");
  }, [pathname, searchString]);

  useEffect(() => {
    function setPhaseBoth(next: Phase) {
      phaseRef.current = next;
      setPhase(next);
    }

    function clearTimers() {
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
      showTimerRef.current = hideTimerRef.current = safetyTimerRef.current = null;
    }

    function finish() {
      if (!activeRef.current) return;
      activeRef.current = false;
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
      showTimerRef.current = safetyTimerRef.current = null;

      // Never became visible (fast / cached navigation) — nothing to hide.
      if (phaseRef.current !== "loading") return;

      const visibleFor = Date.now() - shownAtRef.current;
      const wait = Math.max(0, MIN_VISIBLE_MS - visibleFor);
      hideTimerRef.current = setTimeout(() => {
        setPhaseBoth("finishing");
        hideTimerRef.current = setTimeout(() => {
          hideTimerRef.current = null;
          setPhaseBoth("idle");
        }, FINISH_MS);
      }, wait);
    }

    function start() {
      if (SAFETY_TIMEOUT_MS <= 0) return;
      // Already tracking a navigation — keep its timers. A second click while
      // the first is pending simply rides the same bar.
      if (activeRef.current) return;
      activeRef.current = true;

      // A previous bar may still be fading out; cancel that and start fresh.
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      if (phaseRef.current !== "idle") setPhaseBoth("idle");

      showTimerRef.current = setTimeout(() => {
        showTimerRef.current = null;
        if (!activeRef.current) return;
        shownAtRef.current = Date.now();
        setPhaseBoth("loading");
      }, SHOW_DELAY_MS);

      safetyTimerRef.current = setTimeout(finish, SAFETY_TIMEOUT_MS);
    }

    // Hard reset to idle, with no fade — for a page that is about to be frozen
    // into (or has just been thawed from) the bfcache. Unlike finish() this
    // does not wait for MIN_VISIBLE_MS or FINISH_MS: those timers cannot be
    // trusted across a freeze, and there is nothing left to animate.
    //
    // The idle phase is written to the DOM directly as well as to state. A
    // `pagehide` handler gets no guarantee that React commits a render before
    // the browser snapshots the page, and the snapshot is precisely what the
    // user sees again on Back. React's next render of the same value is a
    // no-op, so the two never disagree.
    function reset() {
      activeRef.current = false;
      clearTimers();
      phaseRef.current = "idle";
      const root = rootRef.current;
      if (root) {
        root.setAttribute("data-phase", "idle");
        root.setAttribute("aria-hidden", "true");
      }
      setPhase("idle");
    }

    startRef.current = start;
    finishRef.current = finish;

    function handleClick(event: MouseEvent) {
      // Plain left-click only.
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (event.defaultPrevented) return;

      const anchor = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href) return;

      // New tab, download, or non-navigating protocol — this page won't change.
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      if (/^(mailto|tel|javascript|blob):/i.test(href)) return;

      let target: URL;
      try {
        target = new URL(href, window.location.href);
      } catch {
        return;
      }

      // External site — the browser shows its own loading state.
      if (target.origin !== window.location.origin) return;

      // Same page (including hash-only anchor scrolls) — nothing to wait for.
      if (`${target.pathname}${target.search}` === currentKeyRef.current) return;

      start();
    }

    // Browser Back / Forward. By the time popstate fires, window.location is
    // already the destination while currentKeyRef still holds the route that
    // is on screen, so a difference means a real route change is coming.
    // Same-key popstates (hash changes, the mobile player's synthetic
    // history entry) are ignored.
    function handlePopState() {
      const key = `${window.location.pathname}${window.location.search}`;
      if (key === currentKeyRef.current) return;
      start();
    }

    // Leaving the page (possibly into the bfcache): never freeze it mid-load.
    function handlePageHide() {
      reset();
    }

    // Coming back from the bfcache: the same page instance is resurrected, so
    // no route change fires. Reset again in case the freeze captured a state
    // (older browsers, or a pagehide that never ran) with the indicator up.
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) reset();
    }

    document.addEventListener("click", handleClick, true);
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
      clearTimers();
      activeRef.current = false;
    };
  }, []);

  // The route actually landed → complete the bar (or cancel it silently if it
  // never became visible).
  useEffect(() => {
    finishRef.current();
  }, [pathname, searchString]);

  return (
    <div
      ref={rootRef}
      aria-hidden={phase === "idle"}
      role="status"
      aria-live="polite"
      className="nav-progress"
      data-phase={phase}
    >
      <div className="nav-progress__bar" />
      {phase === "loading" && <span className="sr-only">Loading the next page.</span>}
    </div>
  );
}
