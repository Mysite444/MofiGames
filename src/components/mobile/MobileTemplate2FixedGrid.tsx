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
 * Template 2 — 3 × 2 Fixed Grid
 *
 * Shows up to 6 games in a centred 3-column × 2-row static grid.
 * No horizontal scroll — every card is always visible.
 * Uses square (1:1) covers to keep the grid compact and uniform.
 */
function FixedGridCard({ game }: { game: Game }) {
  const category = useMergedCategoryBySlug(game.categorySlug);
  const imageSrc = getGameCover(game, "square");
  if (!imageSrc && !category) return null;

  return (
    <Link
      href={`/${game.slug}`}
      className="group relative block aspect-square w-full overflow-hidden rounded-xl ring-1 ring-white/10 transition-all duration-200 active:scale-[0.97]"
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

      {/* Gradient overlay */}
      <div
        className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent"
        aria-hidden
      />

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

export function MobileTemplate2FixedGrid({
  games,
  title,
  subtitle,
  viewAllHref,
  accent = "#ffffff",
  icon,
  showViewAll = true,
}: MobileTemplateSectionProps) {
  // Show exactly 6 games (3 × 2)
  const displayGames = games.slice(0, 6);
  if (displayGames.length === 0) return null;

  const Icon = icon ? iconMap[icon as IconName] : null;

  return (
    <section>
      {/* Section header */}
      <div className="flex items-center justify-between px-4 py-1">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: `${accent}26`, color: accent }}
            >
              <Icon size={16} strokeWidth={2} aria-hidden />
            </span>
          )}
          <div>
            <h2 className="font-category-fat text-[17px] leading-tight text-white">{title}</h2>
            {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
          </div>
        </div>
        {showViewAll && viewAllHref && (
          <Link
            href={viewAllHref}
            className="flex items-center gap-1 text-[13px] font-semibold text-text-muted hover:text-white"
          >
            See all <ArrowRight size={12} aria-hidden />
          </Link>
        )}
      </div>

      {/* Fixed 3 × 2 grid — centred, no scroll */}
      <div className="mt-2 grid grid-cols-3 gap-2 px-4">
        {displayGames.map((game) => (
          <FixedGridCard key={game.id} game={game} />
        ))}
      </div>
    </section>
  );
}
