"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { RefreshCw, Sparkles, Trophy, Flame } from "lucide-react";
import { GameThumbnail } from "./GameThumbnail";
import { getCategoryBySlug } from "@/lib/categories";
import { getGameCover } from "@/lib/game-cover";
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
 * No game name on the tile at all — not below it, not on hover — matching
 * CrazyGames exactly. (The link carries an aria-label so the game is still
 * identified for screen readers.)
 *
 * Hover behavior mirrors CrazyGames exactly: the card does NOT lift/move,
 * a thick white ring appears around it, and — when the game has a
 * `previewVideoUrl` — a short silent looping clip fades in over the static
 * thumbnail. No center play-button overlay.
 */
export function GenreGameCard({ game }: { game: Game }) {
  const category = getCategoryBySlug(game.categorySlug);
  const [previewActive, setPreviewActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Landscape cover (16:9) is the right crop for these fixed 202×114px tiles.
  // Falls back to thumbnailUrl → coverImageUrl → gradient placeholder.
  const imageSrc = getGameCover(game, "landscape");
  if (!imageSrc && !category) return null;

  const BadgeIcon = game.tag ? badgeIcons[game.tag] : null;

  function startPreview() {
    if (!game.previewVideoUrl) return;
    setPreviewActive(true);
    videoRef.current?.play().catch(() => {
      // Autoplay can be blocked in rare cases even when muted — fine,
      // the static thumbnail just stays visible underneath.
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
      className="group block h-full w-full focus-visible:outline-none"
      onMouseEnter={startPreview}
      onMouseLeave={stopPreview}
      onFocus={startPreview}
      onBlur={stopPreview}
    >
      <div className="tile-shine relative h-full w-full overflow-hidden rounded-lg ring-1 ring-white/10 transition-all duration-200 group-hover:scale-[1.03] group-hover:ring-2 group-hover:ring-[rgba(145,70,255,0.5)] group-hover:shadow-[0_6px_20px_rgba(0,0,0,0.4)] group-focus-visible:ring-2 group-focus-visible:ring-[rgba(145,70,255,0.5)] group-active:scale-[0.97]">
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
      </div>
    </Link>
  );
}
