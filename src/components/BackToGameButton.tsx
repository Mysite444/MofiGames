"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

/**
 * Mobile "Back to Game" floating pill — fixed to the bottom of the viewport,
 * slides in once the game hero scrolls out of view, slides away while the
 * hero is visible. Color: var(--color-cta-blue) (#2563EB, Tailwind blue-600)
 * — the same shared token used by every primary CTA pill site-wide (Random
 * Game, Back to Top, pagination — see .btn-cta / .pagination-* in
 * globals.css) — deep cobalt with a blue glow shadow. Chosen over the
 * lighter accent blue (--color-menu-blue, #3DA9FC, used for icons) because a
 * CTA pill needs visual weight: blue-600 passes WCAG AA at 4.97:1 against
 * white text and reads clearly on the site's dark background.
 */
export function BackToGameButton({ targetId }: { targetId: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId]);

  return (
    <a
      href={`#${targetId}`}
      aria-hidden={!visible}
      className={`
        fixed inset-x-4 bottom-4 z-20 flex items-center justify-center gap-2
        rounded-full py-3 text-sm font-bold text-white lg:hidden
        transition-all duration-200
        active:scale-[0.97]
        ${visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-4 opacity-0"}
      `}
      style={{
        background: "var(--color-cta-blue)",
        boxShadow: "0 4px 20px rgba(var(--color-cta-blue-rgb), 0.50), 0 2px 8px rgba(0,0,0,0.30)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = "var(--color-cta-blue-hover)";
        (e.currentTarget as HTMLElement).style.boxShadow =
          "0 6px 28px rgba(var(--color-cta-blue-rgb), 0.65), 0 4px 12px rgba(0,0,0,0.35)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "var(--color-cta-blue)";
        (e.currentTarget as HTMLElement).style.boxShadow =
          "0 4px 20px rgba(var(--color-cta-blue-rgb), 0.50), 0 2px 8px rgba(0,0,0,0.30)";
      }}
    >
      <ArrowUp size={16} strokeWidth={2.5} />
      Back to Game
    </a>
  );
}
