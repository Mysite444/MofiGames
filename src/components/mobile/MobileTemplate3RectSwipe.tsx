"use client";

import Link from "next/link";
import { ArrowRight, Star } from "lucide-react";
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
 * Template 3 — Full-Width Rectangular Swipe
 *
 * Visual signature (matches CrazyGames "Featured games" section):
 *  • Full-width section — no outer rounded card or side margins
 *  • Subtle accent gradient header strip, solid-filled icon badge
 *  • Large portrait (2:3) cards — 108 px wide, 4 visible at once on most phones
 *  • No game name overlays on cards — thumbnails speak for themselves
 *  • Horizontal swipe rail from edge to edge
 */
function RectCard({ game }: { game: Game }) {
  const category = useMergedCategoryBySlug(game.categorySlug);
  const imageSrc = getGameCover(game, "portrait");
  if (!imageSrc && !category) return null;

  return (
    <Link
      href={`/${game.slug}`}
      className="tile-shine group relative block w-[108px] shrink-0 snap-card overflow-hidden rounded-xl ring-1 ring-white/10 transition-all duration-200 active:scale-[0.97] min-[400px]:w-[118px]"
      style={{ aspectRatio: "2/3" }}
    >
      {imageSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageSrc}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
      ) : category ? (
        <GameThumbnail
          category={category}
          variant={game.variant}
          className="absolute inset-0 h-full w-full"
        />
      ) : null}

      {/* Tag badge only — no game name text */}
      {game.tag && (
        <span
          className={`absolute left-1 top-1 rounded px-1 py-0.5 text-[9px] font-bold tracking-wide ${TAG_STYLES[game.tag]}`}
        >
          {game.tag}
        </span>
      )}
    </Link>
  );
}

export function MobileTemplate3RectSwipe({
  games,
  title,
  subtitle,
  viewAllHref,
  accent = "#7C5CFC",
  icon,
  showViewAll = true,
}: MobileTemplateSectionProps) {
  if (games.length === 0) return null;

  const Icon = icon ? iconMap[icon as IconName] : null;

  return (
    <section className="w-full overflow-hidden">
      {/* Full-width header strip — no rounded outer wrapper, no border */}
      <div
        className="px-4 pt-3.5 pb-2.5"
        style={{
          background: `linear-gradient(135deg, ${accent}28 0%, transparent 75%)`,
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* Solid accent badge — CrazyGames style filled icon circle */}
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: accent, color: "#fff" }}
            >
              {Icon ? (
                <Icon size={15} strokeWidth={2} aria-hidden />
              ) : (
                <Star size={14} fill="#fff" strokeWidth={0} aria-hidden />
              )}
            </span>
            <div>
              <h2 className="font-category-fat text-[17px] font-bold leading-tight text-white">
                {title}
              </h2>
              {subtitle && (
                <p className="text-[11px] text-white/60">{subtitle}</p>
              )}
            </div>
          </div>

          {showViewAll && viewAllHref && (
            <Link
              href={viewAllHref}
              className="flex items-center gap-1 text-[12px] font-semibold text-white/70 transition-colors hover:text-white"
            >
              See all <ArrowRight size={11} aria-hidden />
            </Link>
          )}
        </div>
      </div>

      {/* Full-width swipe rail — starts flush with left edge */}
      <div className="snap-rail scrollbar-hide flex gap-2 overflow-x-auto pb-3 pl-4 pt-1.5">
        {games.map((game) => (
          <RectCard key={game.id} game={game} />
        ))}
        {/* Trailing spacer so last card never clips against the screen edge */}
        <div className="w-2 shrink-0" aria-hidden />
      </div>
    </section>
  );
}
