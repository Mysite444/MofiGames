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

// A single small, captionless thumbnail — matches the size/design of the
// reference's "Continue playing" thumb. The 88×88px container is square,
// so we use the square cover (1:1 aspect ratio) to avoid cropping important
// artwork. Hover treatment matches the site-wide card standard: scale-[1.15]
// + blue CTA ring + glow + a slide-up info panel with title and play stats.
export function ContinuePlayingCard({ game }: { game: Game }) {
  const category = useMergedCategoryBySlug(game.categorySlug);
  // Square cover (1:1) matches this 88×88px tile — falls back to
  // thumbnailUrl → coverImageUrl → gradient placeholder.
  const imageSrc = getGameCover(game, "square");
  const [previewActive, setPreviewActive] = useState(false);
  if (!imageSrc && !category) return null;

  // Hover-preview: previewVideoUrl only, same independence as every other
  // card on the site.
  function startPreview() {
    if (!game.previewVideoUrl) return;
    setPreviewActive(true);
  }
  function stopPreview() {
    if (!game.previewVideoUrl) return;
    setPreviewActive(false);
  }

  return (
    // overflow-hidden is intentionally on the <a> tag (same as MiniTile /
    // FeaturedBanner) so the tile-shine sweep and the info-panel gradient are
    // both clipped to the card's rounded boundary without an extra wrapper.
    <Link
      href={`/${game.slug}`}
      aria-label={game.title}
      onMouseEnter={startPreview}
      onMouseLeave={stopPreview}
      onFocus={startPreview}
      onBlur={stopPreview}
      className="tile-shine group relative block h-[88px] w-[88px] overflow-hidden rounded-thumb ring-1 ring-white/10 transition-all duration-300 ease-tile hover:scale-[1.15] hover:ring-2 hover:ring-[var(--color-cta-blue)] hover:shadow-[0_0_20px_2px_rgba(var(--color-cta-blue-rgb),0.55),0_14px_30px_rgba(0,0,0,0.6)] focus-visible:outline-none focus-visible:scale-[1.15] focus-visible:ring-2 focus-visible:ring-[var(--color-cta-blue)] focus-visible:shadow-[0_0_20px_2px_rgba(var(--color-cta-blue-rgb),0.55),0_14px_30px_rgba(0,0,0,0.6)] active:scale-[0.97] active:duration-150 active:ease-out"
    >
      {imageSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageSrc} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <GameThumbnail category={category!} variant={game.variant} className="absolute inset-0 h-full w-full" />
      )}

      {/* Hover-preview clip — previewVideoUrl only, independent of the
          trailer. */}
      {game.previewVideoUrl && (
        <HoverPreviewVideo src={game.previewVideoUrl} active={previewActive} />
      )}

      {/* Bottom gradient so the info panel text is always legible */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/5 to-transparent" aria-hidden />

      {/* Site-wide blue hover accent, matching every other card. Sits above
          the permanent dark fade and only shows once hovered/focused. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-[var(--color-cta-blue)] from-50% to-transparent opacity-0 transition-opacity duration-300 ease-tile group-hover:opacity-100 group-focus-visible:opacity-100"
        aria-hidden
      />

      {game.tag && (
        <span
          className={`absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide transition-opacity duration-300 ease-tile group-hover:opacity-0 ${tagStyles[game.tag]}`}
        >
          {game.tag}
        </span>
      )}

      {/* Hover-reveal info panel — same treatment as MiniTile in TopPicksRow */}
      <div className="pointer-events-none absolute inset-x-1.5 bottom-1.5 flex translate-y-1 flex-col gap-0.5 opacity-0 transition-all duration-300 ease-tile group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
        <p className="truncate font-display text-[10px] font-bold leading-tight text-white">
          {game.title}
        </p>
        <div className="flex items-center gap-1.5 text-[9px] font-semibold text-white/85">
          <span className="flex shrink-0 items-center gap-0.5">
            <Play size={8} className="fill-white" strokeWidth={0} />
            {formatPlays(game.plays)}
          </span>
          <span className="flex shrink-0 items-center gap-0.5">
            <ThumbsUp size={8} />
            {formatPlays(Math.round(game.plays * 0.92))}
          </span>
        </div>
      </div>
    </Link>
  );
}
