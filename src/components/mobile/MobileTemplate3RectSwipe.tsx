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
 * Template 3 — Rectangular Swipe with Colored Background
 *
 * Visual signature:
 *  • Section has a dedicated coloured background panel (category accent)
 *  • Star (★) symbol + section title in the header area
 *  • Smaller rectangular portrait cards (narrower than Template 5)
 *  • Horizontal swipe scroll rail (4 cards visible on a standard phone)
 *
 * This is the "featured category" / "originals-style" layout matching the
 * CrazyGames coloured-panel sections.
 */
function RectCard({ game }: { game: Game }) {
  const category = useMergedCategoryBySlug(game.categorySlug);
  // Portrait (2:3) for the taller rectangular card shape.
  // Spec: "smaller game size thumbnail" — narrower than the existing 128px
  // MobileGameRow portrait card; 72px keeps 4 cards in view at once.
  const imageSrc = getGameCover(game, "portrait");
  if (!imageSrc && !category) return null;

  return (
    <Link
      href={`/${game.slug}`}
      className="tile-shine group relative block w-[72px] shrink-0 snap-card overflow-hidden rounded-xl ring-1 ring-white/10 transition-all duration-200 active:scale-[0.97] min-[400px]:w-[80px]"
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

      <div
        className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent"
        aria-hidden
      />

      {game.tag && (
        <span
          className={`absolute left-1 top-1 rounded px-1 py-0.5 text-[9px] font-bold tracking-wide ${TAG_STYLES[game.tag]}`}
        >
          {game.tag}
        </span>
      )}

      <div className="absolute inset-x-1.5 bottom-1.5">
        <p className="truncate text-[10px] font-bold leading-tight text-white">{game.title}</p>
      </div>
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
  category,
}: MobileTemplateSectionProps) {
  if (games.length === 0) return null;

  // Derive panel background from accent with low opacity
  const panelBg = `${accent}22`;
  const Icon = icon ? iconMap[icon as IconName] : null;

  return (
    <section
      className="rounded-2xl mx-3 overflow-hidden"
      style={{ background: panelBg, border: `1px solid ${accent}30` }}
    >
      {/* Coloured header strip */}
      <div
        className="px-4 pt-3.5 pb-2"
        style={{
          background: `linear-gradient(135deg, ${accent}40 0%, transparent 80%)`,
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Star icon — signature of template 3 */}
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: `${accent}40`, color: accent }}
            >
              {Icon ? (
                <Icon size={14} strokeWidth={2} aria-hidden />
              ) : (
                <Star size={14} fill={accent} strokeWidth={0} aria-hidden />
              )}
            </span>
            <div>
              <h2
                className="font-category-fat text-[16px] leading-tight"
                style={{ color: accent }}
              >
                {title}
              </h2>
              {subtitle && (
                <p className="text-[11px]" style={{ color: `${accent}99` }}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {showViewAll && viewAllHref && (
            <Link
              href={viewAllHref}
              className="flex items-center gap-1 text-[12px] font-semibold opacity-70 hover:opacity-100 transition-opacity"
              style={{ color: accent }}
            >
              See all <ArrowRight size={11} aria-hidden />
            </Link>
          )}
        </div>
      </div>

      {/* Swipe rail */}
      <div className="snap-rail scrollbar-hide flex gap-2 overflow-x-auto pb-3 pl-4 pt-1">
        {games.map((game) => (
          <RectCard key={game.id} game={game} />
        ))}
        <div className="w-2 shrink-0" aria-hidden />
      </div>
    </section>
  );
}
