"use client";

import { useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import { GenreGameCard } from "./GenreGameCard";
import { OriginalsGameCard } from "./OriginalsGameCard";
import type { Game } from "@/lib/types";

// ── CrazyGames-style "peek" card widths ────────────────────────────────────
//
// Instead of a single fixed pixel size, card widths are now calculated so
// that exactly N full cards + a deliberate 0.4-card peek are always visible
// in the rail — matching the effect on CrazyGames where the next card is
// always partially visible at the right edge, signalling scrollability.
//
// Formula (derived from first principles):
//   cardWidth = (containerInnerWidth − N × gap) / (N + peekFraction)
//
// Where:
//   containerInnerWidth  = flex container's content-box width
//                          = viewportWidth − sidebar(60px) − px-padding(64px)
//   N                    = number of *full* cards shown at that breakpoint
//   gap                  = gap-2 = 8px between cards
//   peekFraction         = 0.4  (40 % of the next card is always visible)
//
// The calc() below resolves against the flex container's content-box width
// (what `100%` means for a flex child per the CSS spec), so it is already
// sidebar- and padding-aware with no extra arithmetic at call sites.
//
// Verified peek at each breakpoint baseline:
//   lg  (1024 px viewport): card ≈ 197 px · 40 % peek ✓
//   xl  (1280 px viewport): card ≈ 207 px · 40 % peek ✓
//   2xl (1536 px viewport): card ≈ 213 px · 40 % peek ✓
//
// Card sizes stay close to the original 202 px reference at the baseline of
// each breakpoint and scale proportionally at wider viewports — which is
// exactly how CrazyGames itself behaves at different screen widths.
//
// Heights: derived from aspect-ratio (16:9 landscape / 2:3 portrait) rather
// than a fixed pixel value, so proportions are always perfect no matter what
// width the breakpoint formula produces. Both GenreGameCard and
// OriginalsGameCard use `h-full w-full` internally, so they fill whatever
// dimensions the wrapper establishes.
//
// Hover-grow safety: GenreGameCard scales to 1.18× on hover. At the largest
// card size within each breakpoint range the vertical growth per side is
// always < py-6 (24 px), so the ring/glow never clips — the existing
// px-7 py-6 (md:px-8) padding on the rail is still sufficient.
//
// Tailwind classes used on each snap-card wrapper:
//   w-[202px]                           ← base / mobile (rail hidden at < lg)
//   lg:w-[calc((100%_-_32px)/4.4)]     ← lg  : 4 full + 0.4 peek, gap×4=32px
//   xl:w-[calc((100%_-_40px)/5.4)]     ← xl  : 5 full + 0.4 peek, gap×5=40px
//   2xl:w-[calc((100%_-_48px)/6.4)]    ← 2xl : 6 full + 0.4 peek, gap×6=48px
//
// NOTE ON TAILWIND SYNTAX: CSS calc() requires whitespace around + and -.
// Tailwind arbitrary values encode spaces as underscores (_), so _-_ in the
// class name becomes " - " in the emitted CSS. Without this the browser
// silently ignores the rule and the card stays at w-[202px].

export function CategoryRow({
  title,
  games,
  href,
  variant = "default",
}: {
  title: string;
  games: Game[];
  href?: string;
  /** "originals" swaps in the larger, caption-less tile used for the MofiGames Originals rail. */
  variant?: "default" | "originals";
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const isOriginals = variant === "originals";

  function scrollByCards(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: "smooth" });
  }

  if (games.length === 0) return null;

  return (
    <section className="rail-group relative">
      <div className="mb-1 flex items-center justify-between px-4 md:px-6">
        <h2 className="font-category-fat text-lg leading-tight text-text md:text-xl">
          {title}
        </h2>

        {href && (
          <Link
            href={href}
            className="flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:bg-white/10 hover:text-white"
          >
            See all
            <ArrowRight size={13} />
          </Link>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          aria-label={`Scroll ${title} left`}
          onClick={() => scrollByCards(-1)}
          className="carousel-arrow rail-arrow absolute left-2 top-1/2 z-10 -translate-y-1/2 md:left-4"
        >
          <ChevronLeft size={26} />
        </button>

        {/* IMPORTANT re: the hover-grow effect on GenreGameCard/OriginalsGameCard
            inside this rail — browsers force overflow-y to compute as `auto`
            (i.e. it still clips) whenever overflow-x is `auto` on the same
            element, even if you explicitly write `overflow-y: visible`
            (confirmed against the CSS Overflow spec + tested directly in
            Chrome). So a hovered card's scaled-up ring/glow can NEVER
            render past this element's own padding box, no matter what
            overflow-y is set to — the only real fix is padding: reserve
            enough padding here that the card's growth (computed from its
            fixed size × the hover scale factor in GenreGameCard/
            OriginalsGameCard) always fits *inside* the padding, comfortably
            short of this box's actual edge. px-7/py-6 (plus the md: bump)
            below were sized for exactly that, verified in a real browser —
            don't shrink them without re-checking the hover effect still
            shows on all 4 sides, especially the first/last card in a row. */}
        {/* scroll-pl-* matches the px-7/md:px-8 padding above exactly.
            Without it, CSS scroll-snap (scroll-snap-align: start on each
            .snap-card) computes its snap position against the scrollport
            edge and ignores this element's own padding once the row
            actually has enough cards to scroll — silently "eating" the
            padding we rely on to keep the hover-grow ring from clipping on
            the first card. Confirmed by testing scrollLeft on load: without
            a matching scroll-padding, the browser auto-scrolls to exactly
            cancel out the visual padding, even before any user interaction.
            Keep this in lockstep with px-7/md:px-8 above if either changes. */}
        <div
          ref={scrollerRef}
          className="snap-rail scrollbar-hide flex gap-2 overflow-x-auto px-7 py-6 scroll-pl-7 md:px-8 md:scroll-pl-8"
        >
          {games.map((game) =>
            isOriginals ? (
              <div
                key={game.id}
                className={[
                  "snap-card relative shrink-0 hover:z-40 focus-within:z-40",
                  "aspect-[2/3]",
                  "w-[202px]",
                  // CSS spec requires whitespace around + and - inside calc().
                  // Tailwind encodes a space as underscore (_) inside [brackets],
                  // so _-_ → " - " in the emitted CSS. Without this the browser
                  // silently discards the entire declaration and falls back to
                  // the fixed w-[202px] base above — which is why the peek was
                  // never showing. The /4.4 divisor is fine without spaces.
                  "lg:w-[calc((100%_-_32px)/4.4)]",
                  "xl:w-[calc((100%_-_40px)/5.4)]",
                  "2xl:w-[calc((100%_-_48px)/6.4)]",
                ].join(" ")}
              >
                <OriginalsGameCard game={game} />
              </div>
            ) : (
              <div
                key={game.id}
                className={[
                  "snap-card relative shrink-0 hover:z-40 focus-within:z-40",
                  "aspect-video",
                  "w-[202px]",
                  "lg:w-[calc((100%_-_32px)/4.4)]",
                  "xl:w-[calc((100%_-_40px)/5.4)]",
                  "2xl:w-[calc((100%_-_48px)/6.4)]",
                ].join(" ")}
              >
                <GenreGameCard game={game} />
              </div>
            )
          )}
        </div>

        <button
          type="button"
          aria-label={`Scroll ${title} right`}
          onClick={() => scrollByCards(1)}
          className="carousel-arrow rail-arrow absolute right-2 top-1/2 z-10 -translate-y-1/2 md:right-4"
        >
          <ChevronRight size={26} />
        </button>
      </div>
    </section>
  );
}
