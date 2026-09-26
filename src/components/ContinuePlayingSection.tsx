"use client";

import { useRef } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { ContinuePlayingCard } from "./ContinuePlayingCard";
import { MobileGameRow } from "./MobileGameRow";
import { useRecentlyPlayedSlugs } from "@/lib/game-library";
import { useMergedGames } from "@/lib/games-merged";
import type { Game } from "@/lib/types";

// Desktop shows up to 15 recently-played games to fill the row.
// Mobile shows up to 8 — enough to warrant horizontal scrolling on a
// narrow viewport without overwhelming the section.
const DESKTOP_LIMIT = 15;
const MOBILE_LIMIT = 8;

function useRecentlyPlayedGames(limit: number): Game[] {
  const slugs = useRecentlyPlayedSlugs();
  const { games: allGames } = useMergedGames();
  const bySlug = new Map(allGames.map((g) => [g.slug, g]));
  return slugs
    .slice(0, limit)
    .map((slug) => bySlug.get(slug))
    .filter((g): g is Game => Boolean(g));
}

/**
 * Desktop/laptop homepage — full horizontal-scroll rail of recently-played
 * thumbnails, CrazyGames-style: up to 15 square 88×88 px cards, left/right
 * carousel arrows, hover-grow ring+glow on each card, and the same
 * snap-rail / padding / z-index scaffolding as every other CategoryRow so
 * the scale-[1.15] hover effect is never clipped by this element's overflow.
 *
 * Renders nothing (no empty section) until the visitor has actually played
 * at least one game.
 */
export function ContinuePlayingDesktop() {
  const games = useRecentlyPlayedGames(DESKTOP_LIMIT);
  const scrollerRef = useRef<HTMLDivElement>(null);

  if (games.length === 0) return null;

  function scrollByCards(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    // Scroll ~85 % of the visible width — keeps a partial card visible at
    // the new leading edge so the user has a natural anchor for their place.
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: "smooth" });
  }

  return (
    <section className="rail-group relative">
      {/* ── Header ── */}
      <div className="mb-0 flex items-center justify-between pl-5 pr-4 md:pl-5 md:pr-6">
        <h2 className="font-display text-lg font-extrabold leading-tight text-text md:text-xl">
          Continue Playing
        </h2>
        <Link
          href="/recently-played"
          className="flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:bg-white/10 hover:text-white"
        >
          See all
          <ArrowRight size={13} />
        </Link>
      </div>

      {/* ── Carousel ── */}
      <div className="relative">
        <button
          type="button"
          aria-label="Scroll Continue Playing left"
          onClick={() => scrollByCards(-1)}
          className="carousel-arrow rail-arrow absolute left-2 top-1/2 z-50 -translate-y-1/2 md:left-4"
        >
          <ChevronLeft size={26} />
        </button>

        {/*
          WHY pl-5 (and the matching scroll-pl-5):
          ─────────────────────────────────────────────
          Browsers force overflow-y to compute as `auto` (meaning it still
          clips) whenever overflow-x is `auto` on the same element — the CSS
          Overflow spec allows no other interpretation, and we've verified
          this directly in Chrome. That means a hovered card's scale-[1.15]
          growth can *never* render past this box's padding edge regardless
          of what overflow-y is set to. The only reliable fix is to reserve
          enough padding that the largest possible scale-growth (88px × 1.15
          ≈ 101px; grows by ~6.6 px per side) always lands inside the padding
          and never reaches the actual clip edge — 20px does that with room
          to spare.
          pl-5 (20px) is the same "moved left" left inset now used on every
          desktop row (CategoryRow, LeaderboardPanel's desktop rail, and
          TopPicksRow), rather than this row's own larger px-7/md:px-8 value
          — this component only ever renders inside page.tsx's desktop-only
          `hidden lg:flex` wrapper, so it's always past the md: breakpoint,
          and 88px cards need far less clearance than the 202px GenreGameCard
          tiles CategoryRow uses, so pl-5 is comfortably safe here too.
          pr-7/md:pr-8 on the right is untouched — that's trailing space for
          the *last* card's glow once you scroll to the end, unrelated to
          how far left the row starts.

          scroll-pl-5 must mirror pl-5 exactly: without a matching
          scroll-padding, CSS scroll-snap (snap-card uses
          scroll-snap-align:start) computes its snap position against the raw
          scrollport edge and silently cancels out the visual start-side
          padding once the row has enough cards to scroll — making the first
          card appear flush with the rail edge and clipping its hover ring on
          the left. Verified with scrollLeft logging; keep these in lockstep
          if either ever changes.
        */}
        <div
          ref={scrollerRef}
          className="snap-rail scrollbar-hide flex gap-2 overflow-x-auto pl-5 pr-7 pt-3 pb-4 scroll-pl-5 md:pl-5 md:pr-8 md:scroll-pl-5"
        >
          {games.map((game) => (
            /*
              Each wrapper:
              • shrink-0 — prevents the flex container from squishing cards.
              • Fixed 88×88 px dimensions — the card itself is absolutely
                sized, so the wrapper must match to create a stable layout
                block.
              • hover:z-40 / focus-within:z-40 — lifts the hovered card's
                scaled-up ring/glow above its neighbours (same pattern as
                CategoryRow's GenreGameCard wrappers).
            */
            <div
              key={game.id}
              className="snap-card relative shrink-0 hover:z-40 focus-within:z-40"
              style={{ width: "88px", height: "88px" }}
            >
              <ContinuePlayingCard game={game} />
            </div>
          ))}
        </div>

        <button
          type="button"
          aria-label="Scroll Continue Playing right"
          onClick={() => scrollByCards(1)}
          className="carousel-arrow rail-arrow absolute right-2 top-1/2 z-50 -translate-y-1/2 md:right-4"
        >
          <ChevronRight size={26} />
        </button>
      </div>
    </section>
  );
}

/**
 * Mobile / iOS / Android homepage — horizontally-scrollable row of up to 8
 * recently-played square cards, matching the scroll pattern every other
 * mobile row uses (MobileGameRow with scroll={true}).
 *
 * MobileGameRow already renders nothing when given an empty list, so the
 * section disappears automatically for first-time visitors.
 */
export function ContinuePlayingMobile() {
  const games = useRecentlyPlayedGames(MOBILE_LIMIT);

  return (
    <MobileGameRow
      title="Continue Playing"
      icon="Flame"
      accent="#ffffff"
      games={games}
      viewMoreHref="/recently-played"
      scroll={true}
    />
  );
}
