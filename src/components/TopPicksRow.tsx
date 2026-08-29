"use client";

import { useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { FeaturedBanner } from "./FeaturedBanner";
import { GameThumbnail } from "./GameThumbnail";
import { getCategoryBySlug } from "@/lib/categories";
import type { Game } from "@/lib/types";

const tagStyles: Record<string, string> = {
  TOP: "bg-gold text-[#221a00]",
  HOT: "bg-hot text-white",
  NEW: "glass-strong text-white",
  UPDATED: "glass-strong text-white",
};

// Fixed row height for the whole "big + 2x2 small" unit. The big tile's
// width is derived from this via aspect-[16/9]; the small grid is given an
// explicit pixel width that, split 2x2 with the gap below, reads close to
// the small-thumbnail proportions in the reference screenshots.
const UNIT_HEIGHT = "h-[208px] xl:h-[232px]";
const GRID_WIDTH = "w-[326px] xl:w-[366px]";

// Small captionless tile used only inside the Top Picks grid — same visual
// language as GameCard (tag badge, thick hover ring, no lift/play-button)
// but with the title burned onto the art like FeaturedBanner, instead of a
// caption row below. That's what lets four of these stack 2x2 to exactly
// match the big tile's height, mirroring the reference layout pixel-for-pixel.
function MiniTile({ game }: { game: Game }) {
  const category = getCategoryBySlug(game.categorySlug);
  if (!category) return null;

  return (
    <Link
      href={`/${game.slug}`}
      className="tile-shine group relative block h-full w-full overflow-hidden rounded-xl ring-1 ring-white/10 transition-all duration-200 hover:scale-[1.03] hover:ring-2 hover:ring-[rgba(0,0,0,0.5)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(0,0,0,0.5)] active:scale-[0.97]"
    >
      <GameThumbnail
        category={category}
        variant={game.variant}
        showIcon={false}
        className="absolute inset-0 h-full w-full"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/5 to-transparent" aria-hidden />

      {game.tag && (
        <span
          className={`absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide transition-opacity duration-200 group-hover:opacity-0 ${tagStyles[game.tag]}`}
        >
          {game.tag}
        </span>
      )}

      <p className="absolute inset-x-2 bottom-1.5 truncate font-display text-[11px] font-bold leading-tight text-white">
        {game.title}
      </p>
    </Link>
  );
}

function PickUnit({ banner, grid }: { banner: Game; grid: Game[] }) {
  return (
    <div className={`flex shrink-0 snap-card gap-3 ${UNIT_HEIGHT}`}>
      <div className="aspect-[16/9] h-full shrink-0">
        <FeaturedBanner game={banner} hideWatermark />
      </div>
      <div className={`grid h-full shrink-0 grid-cols-2 grid-rows-2 gap-2 ${GRID_WIDTH}`}>
        {grid.map((g) => (
          <MiniTile key={g.id} game={g} />
        ))}
      </div>
    </div>
  );
}

export function TopPicksRow({
  banners,
  grids,
  country,
}: {
  banners: Game[];
  grids: Game[][];
  /** Visitor's country, already resolved to a display name (e.g. "Pakistan").
   * Null when it couldn't be detected (local dev, non-Vercel host) — falls
   * back to country-less copy rather than showing a placeholder. */
  country?: string | null;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  function scrollByUnits(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: "smooth" });
  }

  if (banners.length === 0) return null;

  return (
    <section className="rail-group relative">
      <div className="mb-1 flex items-center justify-between px-4 md:px-6">
        <h2 className="font-display text-lg font-extrabold leading-tight text-text md:text-xl">
          {country ? `Today's Best in ${country}` : "Today's Best"}
        </h2>
      </div>

      <div className="relative">
        <button
          type="button"
          aria-label="Scroll top picks left"
          onClick={() => scrollByUnits(-1)}
          className="carousel-arrow rail-arrow absolute left-2 top-1/2 z-10 -translate-y-1/2 md:left-4"
        >
          <ChevronLeft size={26} />
        </button>

        <div
          ref={scrollerRef}
          className="snap-rail scrollbar-hide flex gap-4 overflow-x-auto px-4 pt-1 pb-1 md:px-6"
          style={{ scrollPaddingLeft: "1rem" }}
        >
          {banners.map((banner, i) => (
            <PickUnit key={banner.id} banner={banner} grid={grids[i] ?? []} />
          ))}
        </div>

        <button
          type="button"
          aria-label="Scroll top picks right"
          onClick={() => scrollByUnits(1)}
          className="carousel-arrow rail-arrow absolute right-2 top-1/2 z-10 -translate-y-1/2 md:right-4"
        >
          <ChevronRight size={26} />
        </button>
      </div>
    </section>
  );
}
