"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { fetchLinkPrefetchSettings, type LinkPrefetchSettings } from "@/lib/link-prefetch-settings";

/**
 * Admin → Cache → Preloading & Prefetching → Link Prefetch.
 *
 * Renders nothing. Attaches same-origin link prefetching per the
 * admin-configured strategy:
 *   - "hover"    — mouseenter/touchstart (delegated at the document
 *                  level, so it works for links added after mount) with
 *                  a short delay before actually prefetching.
 *   - "viewport" — IntersectionObserver; prefetches a link once it
 *                  scrolls near the viewport.
 *   - "eager"    — prefetches every eligible link on the page right
 *                  away.
 *   - "disabled" — this component becomes a no-op.
 *
 * "eager"/"viewport" only see the links present at the moment they
 * scan the DOM, so this re-scans on every client-side route change
 * (via the usePathname() dependency) rather than trying to track DOM
 * mutations — "hover" doesn't need this since its listener is
 * delegated and picks up new links automatically.
 *
 * Settings-driven but behaviour-only (no rendered output), so — unlike
 * ResourceHints/SpeculationRules — this fetches its own settings
 * client-side rather than needing a server-rendered pass; see
 * link-prefetch-settings.ts for why there's no *-server.ts counterpart.
 */
export function LinkPrefetchController() {
  const router = useRouter();
  const pathname = usePathname();
  const inFlightRef = useRef(0);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    fetchLinkPrefetchSettings().then((settings) => {
      if (cancelled || !settings.enabled || settings.strategy === "disabled") return;
      cleanup = attach(settings);
    });

    function eligiblePath(anchor: HTMLAnchorElement, settings: LinkPrefetchSettings): string | null {
      if (anchor.target && anchor.target !== "_self") return null;
      if (anchor.hasAttribute("download")) return null;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return null;
      let url: URL;
      try {
        url = new URL(href, window.location.origin);
      } catch {
        return null;
      }
      if (url.origin !== window.location.origin) return null;
      if (settings.excludePatterns.some((p) => url.pathname.startsWith(p))) return null;
      return url.pathname + url.search;
    }

    function doPrefetch(path: string, settings: LinkPrefetchSettings) {
      if (seenRef.current.has(path)) return;
      if (inFlightRef.current >= settings.maxConcurrentPrefetches) return;
      seenRef.current.add(path);
      inFlightRef.current += 1;
      try {
        router.prefetch(path);
      } catch {
        // Non-fatal — this is a progressive enhancement, not a
        // requirement for navigation to work.
      } finally {
        // The App Router's prefetch() has no completion signal, so the
        // in-flight slot is released on a short timer instead of being
        // tracked precisely — this cap only needs to smooth out bursts
        // (e.g. an "eager" pass over a long list), not be exact.
        setTimeout(() => {
          inFlightRef.current = Math.max(0, inFlightRef.current - 1);
        }, 2000);
      }
    }

    function attach(settings: LinkPrefetchSettings): () => void {
      const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));

      if (settings.strategy === "eager") {
        for (const anchor of anchors) {
          const path = eligiblePath(anchor, settings);
          if (path) doPrefetch(path, settings);
        }
        return () => {};
      }

      if (settings.strategy === "viewport") {
        const observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              observer.unobserve(entry.target);
              const path = eligiblePath(entry.target as HTMLAnchorElement, settings);
              if (path) doPrefetch(path, settings);
            }
          },
          { rootMargin: "200px" }
        );
        for (const anchor of anchors) observer.observe(anchor);
        return () => observer.disconnect();
      }

      // "hover" — delegated at the document level so it also covers
      // links rendered after this effect ran.
      let timer: ReturnType<typeof setTimeout> | null = null;
      function onOver(e: Event) {
        const anchor = (e.target as HTMLElement)?.closest?.("a[href]") as HTMLAnchorElement | null;
        if (!anchor) return;
        const path = eligiblePath(anchor, settings);
        if (!path) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => doPrefetch(path, settings), settings.hoverDelayMs);
      }
      function onOut() {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      }
      document.addEventListener("mouseover", onOver);
      document.addEventListener("touchstart", onOver, { passive: true });
      document.addEventListener("mouseout", onOut);
      return () => {
        document.removeEventListener("mouseover", onOver);
        document.removeEventListener("touchstart", onOver);
        document.removeEventListener("mouseout", onOut);
        if (timer) clearTimeout(timer);
      };
    }

    return () => {
      cancelled = true;
      cleanup?.();
    };
    // pathname is a deliberate dependency, not an unused one — it's what
    // triggers the "eager"/"viewport" re-scan after a client-side
    // navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, pathname]);

  return null;
}
