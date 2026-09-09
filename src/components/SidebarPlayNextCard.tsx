"use client";

import { useState } from "react";
import Link from "next/link";
import { RefreshCw, Sparkles, Trophy, Flame, Play, ThumbsUp } from "lucide-react";
import { GameThumbnail } from "./GameThumbnail";
import { HoverPreviewVideo } from "./HoverPreviewVideo";
import { useMergedCategoryBySlug } from "@/lib/supabase/real-games-client";
import { getGameCover } from "@/lib/game-cover";
import { formatPlays } from "@/lib/format-plays";
import type { Game, Tag } from "@/lib/types";

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
 * Single big tile used by the "Play next" sidebar (see
 * SidebarPlayNextGrid.tsx). One card per row, full 300px sidebar width,
 * 16:9 — pixel-matched to the CrazyGames "Play next" reference screenshot
 * (their tile sits flush under the 300x250 ad unit at the same width).
 *
 * Same hover-preview behavior as the homepage GameCard: a short, silent,
 * looping clip (`previewVideoUrl`) plays over the static thumbnail on
 * hover/focus. Deliberately its own component rather than reusing
 * GenreGameCard, since GenreGameCard is shared by every other row on the
 * site and has no video-preview wiring — keeping this separate means nothing
 * else has to change to get the "Play next" behavior.
 */
export function SidebarPlayNextCard({ game }: { game: Game }) {
  const category = useMergedCategoryBySlug(game.categorySlug);
  const [previewActive, setPreviewActive] = useState(false);
  // Landscape cover (16:9) matches the 300px-wide 16:9 "Play next" tile.
  // Falls back to thumbnailUrl → coverImageUrl → gradient placeholder.
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
      className="group block h-full w-full focus-visible:outline-none"
      onMouseEnter={startPreview}
      onMouseLeave={stopPreview}
      onFocus={startPreview}
      onBlur={stopPreview}
    >
      <div className="tile-shine relative h-full w-full overflow-hidden rounded-thumb ring-1 ring-white/10 transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-[1.03] group-hover:ring-2 group-hover:ring-[var(--color-cta-blue)] group-hover:shadow-[0_0_20px_2px_rgba(var(--color-cta-blue-rgb),0.55),0_6px_20px_rgba(0,0,0,0.4)] group-focus-visible:ring-2 group-focus-visible:ring-[var(--color-cta-blue)] group-focus-visible:shadow-[0_0_20px_2px_rgba(var(--color-cta-blue-rgb),0.55),0_6px_20px_rgba(0,0,0,0.4)] group-active:scale-[0.97]">
        {imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrc}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <GameThumbnail category={category!} variant={game.variant} className="absolute inset-0 h-full w-full" />
        )}

        {game.previewVideoUrl && (
          <HoverPreviewVideo src={game.previewVideoUrl} active={previewActive} />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" aria-hidden />

        {/* Site-wide blue hover accent, matching every other card. Sits
            above the permanent dark fade and only shows once hovered/
            focused, with the plays/likes row fading in alongside it. */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-[var(--color-cta-blue)] from-50% to-transparent opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden
        />

        {game.tag && BadgeIcon && (
          <span
            className={`absolute left-2 top-2 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-opacity duration-100 group-hover:opacity-0 group-active:opacity-0 ${badgeStyles[game.tag]}`}
          >
            <BadgeIcon size={10} strokeWidth={2.5} />
            {game.tag}
          </span>
        )}

        {game.isSponsored && (
          <span className="absolute right-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/85 backdrop-blur-sm transition-opacity duration-100 group-hover:opacity-0 group-active:opacity-0">
            {game.sponsorLabel || "Sponsored"}
          </span>
        )}

        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 px-2.5 py-2">
          <p className="truncate font-display text-sm font-bold leading-none text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
            {game.title}
          </p>
          {/* Plays/likes — fades in on hover, same as every other card. */}
          <div className="flex translate-y-1 items-center gap-2 text-[10px] font-semibold text-white/85 opacity-0 transition-all duration-100 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
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
    </Link>
  );
}
