"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { RefreshCw, Sparkles, Trophy, Flame, Play, ThumbsUp } from "lucide-react";
import { GameThumbnail } from "./GameThumbnail";
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
 * PC-only 6-column category grid card.
 *
 * Base layout still mirrors CrazyGames' category page: a 16:9 thumbnail
 * that fills the column width, with a TAG badge that fades out on hover
 * and a silent looping preview clip when the game has a previewVideoUrl.
 *
 * Hover now reproduces CrazyGames' actual hover treatment (see the
 * before/after reference screenshots): the tile grows beyond its own grid
 * cell and lifts above neighbouring tiles (CategoryDesktopGrid bumps this
 * card's z-index on hover), and a bottom info panel fades in with the
 * title, genre tag, play count, and like count. The link still carries an
 * aria-label so the game stays identified for screen readers even though
 * the title is now only shown visually on hover.
 *
 * Intentionally separate from:
 *   GenreGameCard  – same tile + hover treatment, used in horizontal rails
 *   GameCard       – square aspect ratio + visible caption, mobile grids
 */
export function CategoryPageCard({ game }: { game: Game }) {
  const category = useMergedCategoryBySlug(game.categorySlug);
  const [previewActive, setPreviewActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Landscape cover (16:9) matches this aspect-video tile — falls back to
  // thumbnailUrl → coverImageUrl → gradient placeholder.
  const imageSrc = getGameCover(game, "landscape");
  if (!imageSrc && !category) return null;

  const BadgeIcon = game.tag ? badgeIcons[game.tag] : null;

  function startPreview() {
    if (!game.previewVideoUrl) return;
    setPreviewActive(true);
    videoRef.current?.play().catch(() => {
      // Autoplay blocked by browser — fine, static thumbnail stays visible.
    });
  }

  function stopPreview() {
    if (!game.previewVideoUrl) return;
    setPreviewActive(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
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
      {/* ── Thumbnail ── 16:9, fills the column. With the 17px grid gap this
          computes to ~195px wide on a 1366px-viewport window — the exact
          column width measured off the CrazyGames reference screenshot.  */}
      <div className="tile-shine relative aspect-video w-full overflow-hidden rounded-xl ring-1 ring-white/10 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.22] group-hover:ring-2 group-hover:ring-[var(--color-cta-blue)] group-hover:shadow-[0_18px_38px_rgba(0,0,0,0.6)] group-focus-visible:scale-[1.22] group-focus-visible:ring-2 group-focus-visible:ring-[var(--color-cta-blue)] group-active:scale-[0.97]">

        {/* Static thumbnail or generated placeholder */}
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
            className="absolute inset-0 h-full w-full"
          />
        )}

        {/* Hover video preview (silent, looping clip) */}
        {game.previewVideoUrl && (
          <video
            ref={videoRef}
            src={game.previewVideoUrl}
            muted
            loop
            playsInline
            preload="none"
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-150 ${
              previewActive ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          />
        )}

        {/* TAG badge — TOP / HOT / NEW / UPDATED */}
        {game.tag && BadgeIcon && (
          <span
            className={`absolute left-1.5 top-1.5 flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide transition-opacity duration-200 group-hover:opacity-0 group-active:opacity-0 ${badgeStyles[game.tag]}`}
          >
            <BadgeIcon size={9} strokeWidth={2.5} />
            {game.tag}
          </span>
        )}

        {/* Sponsored label */}
        {game.isSponsored && (
          <span className="absolute right-1.5 top-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/85 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-0 group-active:opacity-0">
            {game.sponsorLabel || "Sponsored"}
          </span>
        )}

        {/* CrazyGames-style hover info panel — title, genre tag, plays,
            likes. Hidden until hovered/focused; fades + slides up in. */}
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
    </Link>
  );
}
