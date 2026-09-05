"use client";

import Link from "next/link";
import { Play } from "lucide-react";
import { iconMap } from "@/lib/icon-map";
import { GameThumbnail } from "./GameThumbnail";
import { useMergedCategoryBySlug } from "@/lib/supabase/real-games-client";
import { getGameCover } from "@/lib/game-cover";
import type { Game, Category } from "@/lib/types";

const tagStyles: Record<string, string> = {
  TOP: "bg-gold text-[#221a00]",
  HOT: "bg-hot text-white",
  NEW: "glass-strong text-white",
  UPDATED: "glass-strong text-white",
};

export function FeaturedBanner({
  game,
  category: categoryOverride,
  hideWatermark = false,
}: {
  game: Game;
  category?: Category;
  /** Set true to drop the large category-icon watermark — used on the home
   *  page's Top Picks banner. Defaults to false so MobileHome's banner is
   *  unaffected. */
  hideWatermark?: boolean;
}) {
  // useMergedCategoryBySlug prefers the live DB row so admin edits to the
  // category's name, icon, or gradient are reflected immediately.
  // The categoryOverride prop (passed by MobileHome's genreProps helper)
  // still takes precedence when the caller has already resolved it.
  const mergedCategory = useMergedCategoryBySlug(game.categorySlug);
  const category = categoryOverride ?? mergedCategory;
  if (!category) return null;
  const Icon = iconMap[category.icon];
  // Landscape cover (16:9) fills the banner background when available.
  // The gradient + mesh overlays always render on top for brand consistency
  // and to ensure the bottom text/play-button remain legible regardless of
  // what the cover image contains.
  const landscapeSrc = getGameCover(game, "landscape");
  // Square cover (1:1) for the small 48×48px corner icon — portrait/landscape
  // crops would distort the game's logo or character at that size.
  const iconSrc = getGameCover(game, "square");

  return (
    <Link
      href={`/${game.slug}`}
      className="tile-shine group relative block aspect-[16/9] w-full overflow-hidden rounded-2xl ring-1 ring-white/10 transition-all duration-200 hover:scale-[1.015] hover:ring-2 hover:ring-white hover:shadow-[0_6px_24px_rgba(0,0,0,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white active:scale-[0.99]"
    >
      {/* Base layer: actual landscape cover when available; gradient otherwise */}
      {landscapeSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={landscapeSrc}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(120deg, ${category.colorTo}, ${category.colorFrom})` }}
        />
      )}
      <div
        className="mesh-bg absolute inset-0 opacity-90"
        style={{
          backgroundImage: `radial-gradient(circle at 15% 25%, ${category.colorFrom}80, transparent 45%), radial-gradient(circle at 85% 15%, #ffffff28, transparent 40%), radial-gradient(circle at 55% 95%, #00000075, transparent 55%)`,
        }}
        aria-hidden
      />
      {!hideWatermark && (
        <Icon
          size={150}
          strokeWidth={1}
          className="pointer-events-none absolute -right-6 -top-8 text-white/10"
          aria-hidden
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" aria-hidden />

      {game.tag && (
        <span
          className={`absolute left-3 top-3 rounded-md px-2 py-1 text-[11px] font-bold tracking-wide transition-opacity duration-200 group-hover:opacity-0 group-active:opacity-0 ${tagStyles[game.tag]}`}
        >
          {game.tag}
        </span>
      )}

      <div className="absolute inset-x-3 bottom-3 flex items-center gap-2.5">
        {iconSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={iconSrc}
            alt=""
            className="h-12 w-12 shrink-0 rounded-xl object-cover ring-1 ring-white/20"
          />
        ) : (
          <GameThumbnail
            category={category}
            variant={game.variant}
            className="h-12 w-12 shrink-0 rounded-xl ring-1 ring-white/20"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-bold text-white">{game.title}</p>
          <p className="text-xs text-white/70">{category.name}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold text-[#0b0c14] shadow-lg transition-transform group-active:scale-95">
          <Play size={14} className="fill-[#0b0c14]" />
          Play
        </span>
      </div>
    </Link>
  );
}
