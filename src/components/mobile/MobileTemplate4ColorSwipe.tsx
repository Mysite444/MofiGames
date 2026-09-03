"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { iconMap } from "@/lib/icon-map";
import { getGameCover } from "@/lib/game-cover";
import { GameThumbnail } from "@/components/GameThumbnail";
import { useMergedCategoryBySlug } from "@/lib/supabase/real-games-client";
import type { MobileTemplateSectionProps } from "./MobileTemplateProps";
import type { Game, IconName } from "@/lib/types";

const TAG_STYLES: Record<string, string> = {
  TOP: "bg-gold text-[#221a00]",
  HOT: "bg-hot text-white",
  NEW: "glass-strong text-white",
  UPDATED: "glass-strong text-white",
};

/**
 * Template 4 — Color Category Swipe
 *
 * Visual signature:
 *  • Full-width coloured background strip (gradient from category.colorFrom)
 *  • Large category icon watermark in the background
 *  • Title + "See all" in white on the coloured band
 *  • Square swipe cards with a subtle floating shadow
 *
 * Mirrors the CrazyGames category band sections (e.g. "Trending", "Driving").
 */
function ColorCard({ game }: { game: Game }) {
  const category = useMergedCategoryBySlug(game.categorySlug);
  const imageSrc = getGameCover(game, "square");
  if (!imageSrc && !category) return null;

  return (
    <Link
      href={`/${game.slug}`}
      className="tile-shine group relative block w-[84px] shrink-0 snap-card overflow-hidden rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.4)] ring-1 ring-white/10 transition-all duration-200 active:scale-[0.97] min-[400px]:w-[92px]"
    >
      <div className="aspect-square w-full">
        {imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrc}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : category ? (
          <GameThumbnail
            category={category}
            variant={game.variant}
            className="h-full w-full"
          />
        ) : null}
      </div>

      {/* Tag */}
      {game.tag && (
        <span
          className={`absolute left-1 top-1 rounded px-1 py-0.5 text-[9px] font-bold tracking-wide ${TAG_STYLES[game.tag]}`}
        >
          {game.tag}
        </span>
      )}

      {/* Title strip */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-1.5 pb-1.5 pt-4">
        <p className="truncate text-[10px] font-bold leading-tight text-white">{game.title}</p>
      </div>
    </Link>
  );
}

export function MobileTemplate4ColorSwipe({
  games,
  title,
  subtitle,
  viewAllHref,
  accent = "#7C5CFC",
  icon,
  showViewAll = true,
  category,
}: MobileTemplateSectionProps) {
  if (games.length === 0) return null;

  const Icon = icon ? iconMap[icon as IconName] : null;
  // Two-stop gradient for the background strip
  const gradientBg = category
    ? `linear-gradient(120deg, ${category.colorTo}dd 0%, ${category.colorFrom}dd 100%)`
    : `linear-gradient(120deg, ${accent}55 0%, ${accent}33 100%)`;

  return (
    <section>
      {/* Coloured background strip */}
      <div
        className="relative overflow-hidden pt-3 pb-3"
        style={{ background: gradientBg }}
      >
        {/* Large watermark icon */}
        {Icon && (
          <Icon
            size={110}
            strokeWidth={0.8}
            className="pointer-events-none absolute -right-4 -top-4 text-white/10"
            aria-hidden
          />
        )}

        {/* Header row */}
        <div className="relative flex items-center justify-between px-4 mb-2">
          <div className="flex items-center gap-2.5">
            {Icon && (
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20"
              >
                <Icon size={16} strokeWidth={2} className="text-white" aria-hidden />
              </span>
            )}
            <div>
              <h2 className="font-category-fat text-[17px] leading-tight text-white">
                {title}
              </h2>
              {subtitle && (
                <p className="text-[11px] text-white/70">{subtitle}</p>
              )}
            </div>
          </div>

          {showViewAll && viewAllHref && (
            <Link
              href={viewAllHref}
              className="flex items-center gap-1 text-[13px] font-semibold text-white/80 hover:text-white transition-colors"
            >
              See all <ArrowRight size={12} aria-hidden />
            </Link>
          )}
        </div>

        {/* Swipe rail */}
        <div className="snap-rail scrollbar-hide flex gap-2.5 overflow-x-auto pb-1 pl-4">
          {games.map((game) => (
            <ColorCard key={game.id} game={game} />
          ))}
          <div className="w-2 shrink-0" aria-hidden />
        </div>
      </div>
    </section>
  );
}
