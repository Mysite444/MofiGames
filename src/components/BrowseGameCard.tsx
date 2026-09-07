"use client";

import { useState } from "react";
import Link from "next/link";
import { RefreshCw, Sparkles, Trophy, Flame, Play, ThumbsUp } from "lucide-react";
import { GameThumbnail } from "./GameThumbnail";
import { HoverPreviewVideo } from "./HoverPreviewVideo";
import { getGameCover } from "@/lib/game-cover";
import { formatPlays } from "@/lib/format-plays";
import type { Game, Category, Tag } from "@/lib/types";

const badgeStyles: Record<Exclude<Tag, null>, string> = {
  TOP: "bg-gold text-[#221a00]",
  HOT: "bg-hot text-white",
  NEW: "bg-[var(--color-menu-blue)] text-white",
  UPDATED: "glass-strong text-white",
};

const badgeIcons: Record<Exclude<Tag, null>, typeof RefreshCw> = {
  TOP: Trophy,
  HOT: Flame,
  NEW: Sparkles,
  UPDATED: RefreshCw,
};

/**
 * Same visual treatment as CategoryPageCard (16:9, hover-grow + info panel,
 * preview video) but for cross-category listings — /games, search results,
 * etc. — where the category has to be resolved from a merged real+
 * placeholder list rather than the static-only one CategoryPageCard reads
 * from internally. Also keeps its own permanent title caption below the
 * thumbnail (browse listings benefit from an always-visible title since
 * games here span every category, unlike a single-genre page).
 */
export function BrowseGameCard({ game, category }: { game: Game; category: Category | undefined }) {
  const [previewActive, setPreviewActive] = useState(false);
  // Landscape cover (16:9) matches this aspect-video container — falls back
  // to thumbnailUrl → coverImageUrl → gradient placeholder.
  const imageSrc = getGameCover(game, "landscape");
  if (!imageSrc && !category) return null;

  const BadgeIcon = game.tag ? badgeIcons[game.tag] : null;

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
      aria-label={game.title}
      className="group relative block w-full hover:z-40 focus-visible:z-40 focus-visible:outline-none"
      onMouseEnter={startPreview}
      onMouseLeave={stopPreview}
      onFocus={startPreview}
      onBlur={stopPreview}
    >
      <div className="tile-shine relative aspect-video w-full overflow-hidden rounded-xl ring-1 ring-white/10 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.22] group-hover:ring-2 group-hover:ring-[var(--color-cta-blue)] group-hover:shadow-[0_0_22px_2px_rgba(var(--color-cta-blue-rgb),0.55),0_18px_38px_rgba(0,0,0,0.6)] group-focus-visible:scale-[1.22] group-focus-visible:ring-2 group-focus-visible:ring-[var(--color-cta-blue)] group-focus-visible:shadow-[0_0_22px_2px_rgba(var(--color-cta-blue-rgb),0.55),0_18px_38px_rgba(0,0,0,0.6)] group-active:scale-[0.97]">
        {imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageSrc} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <GameThumbnail category={category!} variant={game.variant} className="absolute inset-0 h-full w-full" />
        )}

        {game.previewVideoUrl && (
          <HoverPreviewVideo src={game.previewVideoUrl} active={previewActive} />
        )}

        {game.tag && BadgeIcon && (
          <span
            className={`absolute left-1.5 top-1.5 flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide transition-opacity duration-200 group-hover:opacity-0 group-active:opacity-0 ${badgeStyles[game.tag]}`}
          >
            <BadgeIcon size={9} strokeWidth={2.5} />
            {game.tag}
          </span>
        )}

        {game.isSponsored && (
          <span className="absolute right-1.5 top-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/85 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-0 group-active:opacity-0">
            {game.sponsorLabel || "Sponsored"}
          </span>
        )}

        {/* CrazyGames-style hover info panel — title, genre tag, plays,
            likes. Hidden until hovered/focused; fades + slides up in. The
            permanent caption below the thumbnail stays too (see docstring). */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-1.5 flex-col gap-1 bg-gradient-to-t from-black/92 via-black/55 to-transparent px-2 pb-1.5 pt-7 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
          <p className="truncate font-display text-[11.5px] font-bold leading-tight text-white">
            {game.title}
          </p>
          <div className="flex items-center gap-2 text-[10px] font-semibold text-white/85">
            {category && (
              <span className="truncate rounded bg-white/15 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                {category.name}
              </span>
            )}
            <span className="flex shrink-0 items-center gap-0.5">
              <Play size={9} className="fill-white" strokeWidth={0} />
              {formatPlays(game.plays)}
            </span>
            <span className="flex shrink-0 items-center gap-0.5">
              <ThumbsUp size={9} />
              {formatPlays(Math.round(game.plays * 0.92))}
            </span>
          </div>
        </div>
      </div>
      <p className="mt-1.5 truncate px-0.5 text-xs font-semibold text-text-muted transition-colors group-hover:text-white">
        {game.title}
      </p>
    </Link>
  );
}
