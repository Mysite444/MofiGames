"use client";

import { useState } from "react";
import Link from "next/link";
import { Play, ThumbsUp } from "lucide-react";
import { GameThumbnail } from "./GameThumbnail";
import { HoverPreviewVideo } from "./HoverPreviewVideo";
import { useMergedCategoryBySlug } from "@/lib/supabase/real-games-client";
import { getGameCover } from "@/lib/game-cover";
import { formatPlays } from "@/lib/format-plays";
import type { Game } from "@/lib/types";

const tagStyles: Record<string, string> = {
  TOP: "bg-gold text-[#221a00]",
  HOT: "bg-hot text-white",
  NEW: "glass-strong text-white",
  UPDATED: "glass-strong text-white",
};

export function GameCard({ game, hideTitle = false }: { game: Game; hideTitle?: boolean }) {
  const category = useMergedCategoryBySlug(game.categorySlug);
  const [previewActive, setPreviewActive] = useState(false);
  // Square cover (1:1) matches this card's aspect-square container.
  // Falls back to thumbnailUrl → coverImageUrl → gradient placeholder.
  const imageSrc = getGameCover(game, "square");
  if (!imageSrc && !category) return null;

  // Hover-preview: a short, silent, looping clip that plays over the
  // thumbnail on hover/focus, same behavior as CrazyGames' game cards.
  // Uses previewVideoUrl only — independent of videoTrailerUrl, which is
  // a separate field reserved for the dedicated "Trailer" section on the
  // game page. Either a direct MP4/WebM or a YouTube link works here;
  // the branching lives in HoverPreviewVideo.
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
      className="group block w-full focus-visible:outline-none"
      onMouseEnter={startPreview}
      onMouseLeave={stopPreview}
      onFocus={startPreview}
      onBlur={stopPreview}
    >
      <div className="tile-shine relative aspect-square w-full overflow-hidden rounded-thumb ring-1 ring-white/10 transition-all duration-100 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03] group-hover:ring-2 group-hover:ring-[var(--color-cta-blue)] group-hover:shadow-[0_0_20px_2px_rgba(var(--color-cta-blue-rgb),0.55),0_6px_20px_rgba(0,0,0,0.4)] group-focus-visible:ring-2 group-focus-visible:ring-[var(--color-cta-blue)] group-focus-visible:shadow-[0_0_20px_2px_rgba(var(--color-cta-blue-rgb),0.55),0_6px_20px_rgba(0,0,0,0.4)] group-active:scale-[0.97]">
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

        {game.tag && (
          <span
            className={`absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide transition-opacity duration-100 group-hover:opacity-0 group-active:opacity-0 ${tagStyles[game.tag]}`}
          >
            {game.tag}
          </span>
        )}

        {game.isSponsored && (
          <span className="absolute right-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white/85 backdrop-blur-sm transition-opacity duration-100 group-hover:opacity-0 group-active:opacity-0">
            {game.sponsorLabel || "Sponsored"}
          </span>
        )}

        {/* Same blue hover info panel as every other card on the site —
            title, category, plays, likes on the site's cta-blue accent.
            Hidden until hovered/focused; fades + slides up in. */}
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

      {!hideTitle && (
        <div className="mt-2 px-0.5">
          <p className="truncate font-display text-[13px] font-semibold leading-tight text-text">
            {game.title}
          </p>
        </div>
      )}
    </Link>
  );
}
