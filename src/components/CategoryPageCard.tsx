"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { RefreshCw, Sparkles, Trophy, Flame } from "lucide-react";
import { GameThumbnail } from "./GameThumbnail";
import { useMergedCategoryBySlug } from "@/lib/supabase/real-games-client";
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
 * PC-only 6-column category grid card.
 *
 * Mirrors CrazyGames' category page layout exactly:
 *   • 16:9 thumbnail that fills the column width
 *   • No game name anywhere on the card — not below it, not on hover. Verified
 *     against a reference screenshot of crazygames.com/c/action: zero caption
 *     pixels in the 17px gap between rows, and CrazyGames doesn't reveal a
 *     name on hover there either. The title lives on the game's own page,
 *     not the grid tile. (The link still carries an aria-label so the game
 *     is identified for screen readers.)
 *   • Hover: thick white ring appears, white-glow shadow — no lift, no
 *     play-button overlay, matching CrazyGames exactly
 *   • TAG badge (TOP/HOT/NEW/UPDATED) fades out on hover
 *   • Video preview plays silently on hover when a previewVideoUrl exists
 *
 * Intentionally separate from:
 *   GenreGameCard  – same nameless-tile treatment, used in horizontal rails
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
      className="group block w-full focus-visible:outline-none"
      onMouseEnter={startPreview}
      onMouseLeave={stopPreview}
      onFocus={startPreview}
      onBlur={stopPreview}
    >
      {/* ── Thumbnail ── 16:9, fills the column. With the 17px grid gap this
          computes to ~195px wide on a 1366px-viewport window — the exact
          column width measured off the CrazyGames reference screenshot.  */}
      <div className="tile-shine relative aspect-video w-full overflow-hidden rounded-xl ring-1 ring-white/10 transition-all duration-200 group-hover:scale-[1.03] group-hover:ring-2 group-hover:ring-white group-hover:shadow-[0_6px_20px_rgba(0,0,0,0.4)] group-focus-visible:ring-2 group-focus-visible:ring-white group-active:scale-[0.97]">

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
      </div>
    </Link>
  );
}
