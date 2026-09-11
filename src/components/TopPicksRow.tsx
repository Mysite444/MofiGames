"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Play, ThumbsUp } from "lucide-react";
import { FeaturedBanner } from "./FeaturedBanner";
import { GameThumbnail } from "./GameThumbnail";
import { HoverPreviewVideo } from "./HoverPreviewVideo";
import { useMergedCategoryBySlug } from "@/lib/supabase/real-games-client";
import { getGameCover } from "@/lib/game-cover";
import { formatPlays } from "@/lib/format-plays";
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
//
// GRID_WIDTH is deliberately picked so each of the four mini-tiles lands on
// the *same* 16:9 ratio as the big banner tile — measured directly off the
// CrazyGames "Top picks" row (its two stacked mini-tiles are just as
// landscape as its big cards, not the near-square ~1.6:1 this used to
// produce). With a fixed cell height of (UNIT_HEIGHT - gap) / 2, solving
// width = height * 16/9 gives 364/408 below. Keep this formula in sync if
// UNIT_HEIGHT or the grid gap ever changes.
const UNIT_HEIGHT = "h-[208px] xl:h-[232px]";
const GRID_WIDTH = "w-[364px] xl:w-[408px]";

// Small captionless tile used only inside the Top Picks grid — same visual
// language as every other card on the site now (hover-grow + colored ring +
// blue glow + a plays/likes row that fades in), just with the title burned
// onto the art like FeaturedBanner instead of a caption row below. That's
// what lets four of these stack 2x2 to exactly match the big tile's height.
function MiniTile({ game }: { game: Game }) {
  const category = useMergedCategoryBySlug(game.categorySlug);
  // Prefer the square cover → thumbnailUrl → coverImageUrl fallback chain.
  // Only fall back to the gradient GameThumbnail when no image is available.
  const imageSrc = getGameCover(game, "square");
  const [previewActive, setPreviewActive] = useState(false);

  if (!imageSrc && !category) return null;

  // Hover-preview: previewVideoUrl only, same independence as every other
  // card on the site.
  function startPreview() {
    if (!game.previewVideoUrl) return;
    setPreviewActive(true);
  }
  function stopPreview() {
    if (!game.previewVideoUrl) return;
    setPreviewActive(false);
  }

  return (
    <Link
      href={`/${game.slug}`}
      onMouseEnter={startPreview}
      onMouseLeave={stopPreview}
      onFocus={startPreview}
      onBlur={stopPreview}
      className="tile-shine group relative block h-full w-full overflow-hidden rounded-thumb ring-1 ring-white/10 transition-all duration-300 ease-tile hover:scale-[1.15] hover:ring-2 hover:ring-[var(--color-cta-blue)] hover:shadow-[0_0_20px_2px_rgba(var(--color-cta-blue-rgb),0.55),0_14px_30px_rgba(0,0,0,0.6)] focus-visible:outline-none focus-visible:scale-[1.15] focus-visible:ring-2 focus-visible:ring-[var(--color-cta-blue)] focus-visible:shadow-[0_0_20px_2px_rgba(var(--color-cta-blue-rgb),0.55),0_14px_30px_rgba(0,0,0,0.6)] active:scale-[0.97] active:duration-150 active:ease-out"
    >
      {imageSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageSrc}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <GameThumbnail
          category={category!}
          variant={game.variant}
          showIcon={false}
          className="absolute inset-0 h-full w-full"
        />
      )}

      {/* Hover-preview clip — previewVideoUrl only, independent of the
          trailer, sitting above the static cover and below the fade/info
          overlays below so the title/stats stay legible either way. */}
      {game.previewVideoUrl && (
        <HoverPreviewVideo src={game.previewVideoUrl} active={previewActive} />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/5 to-transparent" aria-hidden />

      {/* Site-wide blue hover accent, matching every other card. Sits above
          the permanent dark fade and only shows once hovered/focused. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-[var(--color-cta-blue)] from-50% to-transparent opacity-0 transition-opacity duration-300 ease-tile group-hover:opacity-100 group-focus-visible:opacity-100"
        aria-hidden
      />

      {game.tag && (
        <span
          className={`absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide transition-opacity duration-300 ease-tile group-hover:opacity-0 ${tagStyles[game.tag]}`}
        >
          {game.tag}
        </span>
      )}

      <p className="absolute inset-x-2 bottom-1.5 truncate font-display text-[11px] font-bold leading-tight text-white transition-opacity duration-300 ease-tile group-hover:opacity-0 group-focus-visible:opacity-0">
        {game.title}
      </p>

      {/* Same hover-reveal stats row as every other card on the site —
          replaces the always-on title above while hovered/focused. */}
      <div className="pointer-events-none absolute inset-x-1.5 bottom-1.5 flex translate-y-1 flex-col gap-0.5 opacity-0 transition-all duration-300 ease-tile group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
        <p className="truncate font-display text-[11px] font-bold leading-tight text-white">{game.title}</p>
        <div className="flex items-center gap-1.5 text-[9px] font-semibold text-white/85">
          <span className="flex shrink-0 items-center gap-0.5">
            <Play size={8} className="fill-white" strokeWidth={0} />
            {formatPlays(game.plays)}
          </span>
          <span className="flex shrink-0 items-center gap-0.5">
            <ThumbsUp size={8} />
            {formatPlays(Math.round(game.plays * 0.92))}
          </span>
        </div>
      </div>
    </Link>
  );
}

function PickUnit({ banner, grid }: { banner: Game; grid: Game[] }) {
  return (
    // ── Unit width: CrazyGames-style peek ─────────────────────────────────
    // Formula: (containerInnerWidth − 1 × gap) / (1 + peekFraction)
    //   = (100% − 8px) / 1.4
    // "100%" resolves against the snap-rail's content-box (already
    // sidebar- and px-padding-aware per the CSS flex spec). At a
    // 1366 px laptop (inner ≈ 1242 px) each unit becomes 881 px, leaving
    // exactly 40 % of the next unit's banner peeking at the right edge —
    // the same visual cue CrazyGames uses on its "Top picks" row.
    //
    // Previously the unit had no explicit width; its natural size
    // (banner ~370 px + gap 8 px + grid 364 px = 742 px) left 66 % of
    // the next unit visible at 1366 px — almost a full second unit —
    // which looked intentional rather than like a scroll hint.
    //
    // gap-2 (8px) keeps the tight inter-element rhythm unchanged.
    //
    // CSS calc() requires whitespace around "-"; Tailwind encodes that
    // as _-_ inside [brackets] so the generated CSS is valid.
    <div className={`relative flex shrink-0 snap-card gap-2 ${UNIT_HEIGHT} w-[calc((100%_-_8px)/1.4)]`}>
      {/* Banner: flex-1 fills whatever width remains after the
          fixed-width mini-grid is placed (unit_width − gap − GRID_WIDTH).
          Previously aspect-[16/9] + h-full derived the width from
          UNIT_HEIGHT alone, making the unit too narrow. With flex-1 the
          banner adapts to the calc-driven unit width instead.
          FeaturedBanner uses h-full w-full + object-cover internally so
          it renders correctly at any aspect ratio.
          relative z-0 / hover:z-40: same z-index trick as before so the
          banner's hover-grow ring is never painted over by adjacent
          mini-tiles. */}
      <div className="relative z-0 flex-1 min-w-0 h-full hover:z-40 focus-within:z-40">
        <FeaturedBanner game={banner} hideWatermark />
      </div>
      {/* Each cell gets its own hover:z-40 so the scaled tile always
          renders above the FeaturedBanner and its neighbouring cells —
          the same pattern CategoryRow uses for GenreGameCard wrappers. */}
      <div className={`grid h-full shrink-0 grid-cols-2 grid-rows-2 gap-2 ${GRID_WIDTH}`}>
        {grid.map((g) => (
          <div key={g.id} className="relative hover:z-40 focus-within:z-40">
            <MiniTile game={g} />
          </div>
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

        {/* Same px-7/py-6 padding fix as CategoryRow's scroller — overflow-y
            always computes to `auto` (still clips) once overflow-x is auto,
            no matter what you set it to, so padding is the only thing that
            keeps a hovered banner/mini-tile's grow+glow from being cut off
            here too. See the long comment in CategoryRow.tsx for the why.
            scroll-pl-* matches that padding for the same reason CategoryRow
            needs it: scroll-snap-align:start otherwise eats the start-side
            padding once the row actually scrolls, clipping the first unit's
            hover ring on the left. */}
        {/* gap-2, not gap-4: same tight ~8px rhythm as the rest of the row
            (see PickUnit) rather than a bigger gap between units — that
            16px was the single biggest source of "dead space" between one
            unit's grid and the next unit's banner. Tightening it also means
            the next unit's banner starts sooner, so a slice of it stays
            visible at the row's right edge (the CrazyGames-style "peek")
            instead of ending flush at the last fully-visible unit. */}
        <div
          ref={scrollerRef}
          className="snap-rail scrollbar-hide flex gap-2 overflow-x-auto px-7 py-6 scroll-pl-7 md:px-8 md:scroll-pl-8"
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
