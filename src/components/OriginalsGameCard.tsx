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

// Bigger, bolder badge than the regular GameCard tag — closer to the chunky
// "Updated" / "Top" pills CrazyGames puts on its Originals tiles.
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

// Splits a generated title into a "wordmark": every word white except the
// last, which picks up the gold accent — mimicking the two-tone logo
// lettering baked into CrazyGames' own Originals artwork (BLOCK / BLASTER,
// CRAZY / OFFICE, etc.) without needing real custom artwork per game.
function Wordmark({ title }: { title: string }) {
  const words = title.trim().split(/\s+/);
  const last = words.pop();
  return (
    <p className="font-display text-[18px] font-bold uppercase leading-[1.02] tracking-tight text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)] lg:text-[19px]">
      {words.length > 0 && <span>{words.join(" ")} </span>}
      <span className="text-gold">{last}</span>
    </p>
  );
}

/**
 * Tile for the "MofiGames Originals" rail — desktop/laptop only. Fixed
 * exact size (set by the parent wrapper in CategoryRow: 202px x 304px,
 * measured directly off the CrazyGames Originals tiles), no caption row
 * underneath (title lives on the art itself, like a logo), and a chunkier
 * corner badge.
 *
 * Hover reproduces CrazyGames' real hover treatment: the tile grows beyond
 * its own grid cell and lifts above its neighbours (CategoryRow bumps this
 * card's z-index on hover), and a play-count/like-count row fades in below
 * the wordmark — the wordmark itself already covers the "title" part of the
 * info panel other cards only show on hover.
 *
 * Uses the portrait cover (2:3, 800×1200) so the full artwork is visible
 * without object-fit cropping characters/logos from the top or sides.
 */
export function OriginalsGameCard({ game }: { game: Game }) {
  const category = useMergedCategoryBySlug(game.categorySlug);
  // Portrait cover (2:3) matches this 202×304px tile exactly — falls back to
  // thumbnailUrl → coverImageUrl → gradient placeholder.
  const imageSrc = getGameCover(game, "portrait");
  const [previewActive, setPreviewActive] = useState(false);
  if (!imageSrc && !category) return null;

  const BadgeIcon = game.tag ? badgeIcons[game.tag] : null;

  // Hover-preview: previewVideoUrl only, same independence as every other
  // card on the site (this tile's other hover effects stay pure-CSS via
  // group-hover; only the video needs React state to play/pause).
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
      className="group block h-full w-full focus-visible:outline-none"
    >
      <div className="tile-shine relative h-full w-full overflow-hidden rounded-xl ring-1 ring-white/10 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.1] group-hover:ring-2 group-hover:ring-[var(--color-cta-blue)] group-hover:shadow-[0_0_22px_2px_rgba(var(--color-cta-blue-rgb),0.55),0_14px_32px_rgba(0,0,0,0.6)] group-focus-visible:scale-[1.1] group-focus-visible:ring-2 group-focus-visible:ring-[var(--color-cta-blue)] group-focus-visible:shadow-[0_0_22px_2px_rgba(var(--color-cta-blue-rgb),0.55),0_14px_32px_rgba(0,0,0,0.6)] group-active:scale-[0.97]">
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

        {/* Hover-preview clip — previewVideoUrl only, independent of the
            trailer, layered above the cover art and below the fade/badge/
            wordmark overlays so they stay legible either way. */}
        {game.previewVideoUrl && (
          <HoverPreviewVideo src={game.previewVideoUrl} active={previewActive} />
        )}

        {/* Stronger bottom fade than the small grid cards — needed so the
            wordmark text stays legible sitting directly on the art. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" aria-hidden />

        {/* Site-wide blue hover accent — same cta-blue panel every other
            card reveals on hover, layered on top of the permanent fade
            above so the wordmark stays legible either way. */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-[var(--color-cta-blue)] from-50% to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden
        />

        {game.tag && BadgeIcon && (
          <span
            className={`absolute left-2 top-2 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide transition-opacity duration-200 group-hover:opacity-0 group-active:opacity-0 ${badgeStyles[game.tag]}`}
          >
            <BadgeIcon size={11} strokeWidth={2.5} />
            {game.tag}
          </span>
        )}

        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-3">
          <Wordmark title={game.title} />

          {/* Plays/likes — fades in on hover, matching every other card's
              info panel (the title itself is already always-visible above). */}
          <div className="flex translate-y-1.5 items-center gap-2 text-[10px] font-semibold text-white/85 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
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
