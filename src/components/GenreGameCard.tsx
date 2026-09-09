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
 * The single, consistent tile used for every regular genre/category row on
 * desktop/laptop (Featured, New, Can't Stop Playing, every genre loop row,
 * Recently Updated, "More <Category>" on the game page, etc.) — every one
 * of them renders this same card at the same fixed size. The three rows
 * that intentionally look different (Continue Playing, Top Picks for You,
 * MofiGames Originals) use their own components and are untouched.
 *
 * Fixed exact size (set by the parent wrapper in CategoryRow: 202px x
 * 114px, ~16:9) measured pixel-for-pixel off CrazyGames' own regular rows.
 *
 * Corner radius uses the shared `rounded-thumb` utility (--radius-thumb,
 * 14px — see globals.css) rather than a stock Tailwind step, so this tile
 * shares an identical curve with every other game-thumbnail card site-wide.
 *
 * Hover behavior mirrors CrazyGames' real hover treatment (see the
 * before/after reference screenshots): the tile grows well beyond its own
 * grid cell and lifts above its neighbours (the parent wrapper — CategoryRow
 * / CategoryDesktopGrid / LeaderboardPanel — bumps its z-index on hover so
 * the overlap renders on top, not underneath), and a bottom info panel
 * fades in with the title, genre tag, play count, and like count — exactly
 * the info CrazyGames surfaces on hover. A short silent looping preview
 * clip still fades in over the static thumbnail when the game has a
 * `previewVideoUrl`. Colors use the site's own blue accent
 * (--color-cta-blue) for the glow ring rather than CrazyGames' purple, to
 * stay consistent with the site's black/white/glass rebrand elsewhere.
 */
export function GenreGameCard({ game }: { game: Game }) {
  const category = useMergedCategoryBySlug(game.categorySlug);
  const [previewActive, setPreviewActive] = useState(false);
  // Landscape cover (16:9) is the right crop for these fixed 202×114px tiles.
  // Falls back to thumbnailUrl → coverImageUrl → gradient placeholder.
  const imageSrc = getGameCover(game, "landscape");
  if (!imageSrc && !category) return null;

  const BadgeIcon = game.tag ? badgeIcons[game.tag] : null;

  // previewVideoUrl only — independent of videoTrailerUrl (that field is
  // reserved for the dedicated "Trailer" section on the game page).
  const hoverSrc = game.previewVideoUrl;

  function startPreview() {
    if (!hoverSrc) return;
    setPreviewActive(true);
  }

  function stopPreview() {
    if (!hoverSrc) return;
    setPreviewActive(false);
  }

  return (
    <Link
      href={`/${game.slug}`}
      aria-label={game.title}
      className="group block h-full w-full focus-visible:outline-none"
      onMouseEnter={startPreview}
      onMouseLeave={stopPreview}
      onFocus={startPreview}
      onBlur={stopPreview}
    >
      <div className="tile-shine relative h-full w-full overflow-hidden rounded-thumb ring-1 ring-white/10 transition-all duration-100 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.18] group-hover:ring-2 group-hover:ring-[var(--color-cta-blue)] group-hover:shadow-[0_0_22px_2px_rgba(var(--color-cta-blue-rgb),0.55),0_14px_32px_rgba(0,0,0,0.6)] group-focus-visible:scale-[1.18] group-focus-visible:ring-2 group-focus-visible:ring-[var(--color-cta-blue)] group-focus-visible:shadow-[0_0_22px_2px_rgba(var(--color-cta-blue-rgb),0.55),0_14px_32px_rgba(0,0,0,0.6)] group-active:scale-[0.97]">
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

        {hoverSrc && (
          <HoverPreviewVideo src={hoverSrc} active={previewActive} />
        )}

        {game.tag && BadgeIcon && (
          <span
            className={`absolute left-1.5 top-1.5 flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide transition-opacity duration-100 group-hover:opacity-0 group-active:opacity-0 ${badgeStyles[game.tag]}`}
          >
            <BadgeIcon size={9} strokeWidth={2.5} />
            {game.tag}
          </span>
        )}

        {game.isSponsored && (
          <span className="absolute right-1.5 top-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/85 backdrop-blur-sm transition-opacity duration-100 group-hover:opacity-0 group-active:opacity-0">
            {game.sponsorLabel || "Sponsored"}
          </span>
        )}

        {/* CrazyGames-style hover info panel — title, genre tag, plays,
            likes. Hidden until hovered/focused; fades + slides up in. Uses
            the site's own blue accent (--color-cta-blue) for the panel
            fill, matching the glow ring above, instead of a plain black
            fade. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-1.5 flex-col gap-1 bg-gradient-to-t from-[var(--color-cta-blue)] from-60% to-transparent px-2 pb-1.5 pt-2.5 opacity-0 transition-all duration-100 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
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
