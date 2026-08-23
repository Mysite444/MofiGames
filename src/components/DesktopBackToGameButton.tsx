"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";

/**
 * Desktop/laptop "Back to game" button — a pill in the site's theme purple
 * with white text, fixed near the bottom of the screen, that only shows up
 * once the player has scrolled out of view, and bounces in place while
 * visible. It hides the instant you scroll (so it's not distracting while
 * actively reading the page) and reappears a moment after scrolling stops.
 */
export function DesktopBackToGameButton({ targetId }: { targetId: string }) {
  const [outOfView, setOutOfView] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) return;

    const observer = new IntersectionObserver(([entry]) => setOutOfView(!entry.isIntersecting), {
      threshold: 0,
    });
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
    /* Outer layer spans the full width so it can sit above everything, but
       carries left/right padding that mirrors the real page layout: the
       sidebar rail (read from AppShell's --sidebar-rail variable, so this
       stays correct whether the rail is showing or collapsed) plus the
       page's own side padding on the left, and the 300px "Play next" aside
       plus its gap on the right. What's left in the middle is exactly the
       post-content column's width, so centering the pill inside it lines
       the button up with the post itself instead of the whole screen. */
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
        className={`btn-cta pointer-events-auto flex items-center gap-2 px-6 py-2.5 text-sm transition-opacity duration-200 ${
          shown ? "opacity-100 animate-bounce" : "pointer-events-none opacity-0"
        }`}
      >
        <ArrowUp size={16} strokeWidth={2.5} />
        Back to Game
      </a>
    </div>
  );
}
