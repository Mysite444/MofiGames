"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

// How long a navigation must be "in flight" before the overlay appears.
// Fast/prefetched navigations complete before this fires, so they get no
// spinner at all — eliminating the "constant refresh" feeling on quick hops.
const SHOW_DELAY_MS = 120;

// Minimum time the overlay stays visible once it has actually appeared, so
// the spinner never flashes for a single frame on a slightly-slow navigation.
const MIN_VISIBLE_MS = 220;

// Hard ceiling — if a navigation never lands (dead route, network stall,
// mis-detected click) the page must not stay permanently unclickable.
const SAFETY_TIMEOUT_MS = 10_000;

/**
 * Site-wide "buffering" indicator — CrazyGames-style. Appears only when a
 * navigation takes longer than SHOW_DELAY_MS so fast/cached page hops
 * never show a spinner at all.
 *
 * While pending: the real page content behind it gets darkened via a CSS
 * filter and made unclickable (see "nav-loading" in globals.css) — not a
 * translucent colored panel layered on top, the actual content dims. Just
 * the spinner icon floats on top of that, nothing else (no card, no
 * "Loading…" label). Scoped to the content area only, not the header/nav —
 * applying a filter to an ancestor of the fixed header would break its
 * pinned positioning while scrolling (see the CSS comment for why), and
 * leaving it clickable also means a misclick elsewhere never feels stuck.
 *
 * Self-contained by design (no context/provider) — mounted once in the
 * root layout inside a <Suspense> boundary (required for useSearchParams).
 */
export function NavigationLoadingOverlay() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);

  // Toggles the page-wide dim + click-block (see html.nav-loading in
  // globals.css) in lockstep with `pending`. A class on <html> rather than
  // wiring a context through the app, consistent with this component
  // staying self-contained.
  useEffect(() => {
    document.documentElement.classList.toggle("nav-loading", pending);
    return () => {
      document.documentElement.classList.remove("nav-loading");
    };
  }, [pending]);

  // Tracks when the overlay first became visible (for MIN_VISIBLE_MS floor).
  const shownAtRef = useRef<number | null>(null);
  // Timer that delays showing the overlay until SHOW_DELAY_MS elapses.
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Timer that hides the overlay after MIN_VISIBLE_MS has passed.
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Safety valve that forces the overlay off after SAFETY_TIMEOUT_MS.
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // "Where are we now" — read (not subscribed to) inside the click handler
  // so the handler closure doesn't go stale.
  const currentKeyRef = useRef("");

  // Keep currentKeyRef in sync with the live route.
  useEffect(() => {
    const search = searchParams?.toString();
    currentKeyRef.current = search ? `${pathname}?${search}` : (pathname ?? "");
  }, [pathname, searchParams]);

  // SHOW — fires the instant a real internal navigation click happens,
  // then waits SHOW_DELAY_MS before actually displaying the overlay.
  useEffect(() => {
    function clearSafety() {
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = null;
      }
    }

    function handleClick(event: MouseEvent) {
      // Plain left-click only.
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (event.defaultPrevented) return;

      const anchor = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href) return;

      // New tab, download, or non-navigating protocol — page won't change.
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      if (/^(mailto|tel|javascript|blob):/i.test(href)) return;

      let target: URL;
      try {
        target = new URL(href, window.location.href);
      } catch {
        return;
      }

      // External site — browser handles its own loading state.
      if (target.origin !== window.location.origin) return;

      const targetKey = `${target.pathname}${target.search}`;
      // Same page (including hash-only anchor scroll) — nothing to buffer.
      if (targetKey === currentKeyRef.current) return;

      // Cancel any previous pending show timer before scheduling a new one.
      if (showTimerRef.current !== null) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }

      // Wait SHOW_DELAY_MS before showing — if navigation finishes first
      // (route change fires in the hide effect below), this timer is
      // cancelled and the overlay never appears.
      showTimerRef.current = setTimeout(() => {
        showTimerRef.current = null;
        shownAtRef.current = Date.now();
        setPending(true);
        clearSafety();
        safetyTimeoutRef.current = setTimeout(() => setPending(false), SAFETY_TIMEOUT_MS);
      }, SHOW_DELAY_MS);
    }

    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
      clearSafety();
      if (showTimerRef.current !== null) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
    };
  }, []);

  // HIDE — once the route actually lands (pathname/search change), either
  // cancel the pending show timer (fast navigation — overlay never shown)
  // or clear the overlay respecting the MIN_VISIBLE_MS floor.
  useEffect(() => {
    // Navigation completed before the show delay elapsed → cancel the
    // timer so the overlay never appears at all.
    if (showTimerRef.current !== null) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
      return;
    }

    if (!pending) return;

    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);

    const elapsed = shownAtRef.current ? Date.now() - shownAtRef.current : MIN_VISIBLE_MS;
    const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);

    hideTimeoutRef.current = setTimeout(() => {
      setPending(false);
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = null;
      }
    }, remaining);

    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
    // Intentionally reacts only to the route actually landing, not to
    // `pending` itself — see component doc above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  return (
    // Just the icon, centered — no card, no background, no "Loading…" text.
    // The dark effect and click-blocking both come from the "nav-loading"
    // class toggled on <html> above, not from this element, so this stays
    // pointer-events-none: it's purely decorative, nothing to interact with.
    <div
      aria-hidden={!pending}
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-200 ${
        pending ? "opacity-100" : "opacity-0"
      }`}
    >
      <Loader2 size={40} className="animate-spin text-white drop-shadow-[0_0_12px_rgba(0,0,0,0.6)]" />
      <span className="sr-only">Loading the next page, please wait.</span>
    </div>
  );
}
