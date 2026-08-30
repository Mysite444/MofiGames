"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";

/**
 * Desktop "Back to Game" floating pill — appears once the player scrolls out
 * of view, hides while actively scrolling, bounces to draw the eye when
 * stationary. Positioned to align with the post-content column (sidebar rail
 * on the left, 300 px "Play next" aside on the right).
 *
 * Color: #2563EB (Tailwind blue-600).
 * Rationale: the project's light accent blue (#3DA9FC) is reserved for icon
 * states (bookmarks, etc.) and lacks CTA weight on a dark background.
 * blue-600 is deep cobalt — 4.97:1 contrast vs. white (WCAG AA), used by
 * Discord, Linear, and Figma as their primary dark-UI action colour — so the
 * pill reads as a clear, intentional call-to-action without competing with
 * other UI chrome.
 */
export function DesktopBackToGameButton({ targetId }: { targetId: string }) {
  const [outOfView, setOutOfView] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  const [hovered, setHovered] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) return;
    const observer = new IntersectionObserver(
      ([entry]) => setOutOfView(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId]);

  useEffect(() => {
    function handleScroll() {
      setScrolling(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setScrolling(false), 250);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const shown = outOfView && !scrolling;

  return (
    /*
     * Outer layer spans the full width so it can sit above everything, but
     * carries left/right padding that mirrors the real page layout: the
     * sidebar rail (read from --sidebar-rail, so this stays correct whether
     * the rail is showing or collapsed) plus the page's own side padding on
     * the left, and the 300 px "Play next" aside plus its gap on the right.
     */
    <div
      aria-hidden={!shown}
      style={{
        paddingLeft: "calc(var(--sidebar-rail, 60px) + 24px)",
        paddingRight: "348px",
      }}
      className="pointer-events-none fixed inset-x-0 bottom-6 z-30 hidden justify-center transition-[padding] duration-200 lg:flex"
    >
      <a
        href={`#${targetId}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`
          pointer-events-auto flex items-center gap-2 rounded-full
          px-6 py-2.5 text-sm font-bold text-white
          transition-all duration-200 active:scale-[0.97]
          ${shown ? "opacity-100 animate-bounce" : "pointer-events-none opacity-0"}
        `}
        style={{
          background: hovered ? "#1D4ED8" : "#2563EB",
          boxShadow: hovered
            ? "0 6px 28px rgba(37,99,235,0.65), 0 4px 12px rgba(0,0,0,0.35)"
            : "0 4px 20px rgba(37,99,235,0.50), 0 2px 8px rgba(0,0,0,0.30)",
        }}
      >
        <ArrowUp size={16} strokeWidth={2.5} />
        Back to Game
      </a>
    </div>
  );
}
