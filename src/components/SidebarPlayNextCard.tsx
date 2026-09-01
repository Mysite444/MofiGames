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
  const videoRef = useRef<HTMLVideoElement>(null);
  // Landscape cover (16:9) matches the 300px-wide 16:9 "Play next" tile.
  // Falls back to thumbnailUrl → coverImageUrl → gradient placeholder.
  const imageSrc = getGameCover(game, "landscape");
  if (!imageSrc && !category) return null;

  const BadgeIcon = game.tag ? badgeIcons[game.tag] : null;

  function startPreview() {
    if (!game.previewVideoUrl) return;
    setPreviewActive(true);
    videoRef.current?.play().catch(() => {
      // Autoplay can be blocked in rare cases even when muted — fine, the
      // static thumbnail just stays visible underneath.
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
      className="group block h-full w-full focus-visible:outline-none"
      onMouseEnter={startPreview}
      onMouseLeave={stopPreview}
      onFocus={startPreview}
      onBlur={stopPreview}
    >
      <div className="tile-shine relative h-full w-full overflow-hidden rounded-xl ring-1 ring-white/10 transition-all duration-200 group-hover:scale-[1.03] group-hover:ring-2 group-hover:ring-white group-hover:shadow-[0_6px_20px_rgba(0,0,0,0.4)] group-focus-visible:ring-2 group-focus-visible:ring-white group-active:scale-[0.97]">
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

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" aria-hidden />

        {game.tag && BadgeIcon && (
          <span
            className={`absolute left-2 top-2 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-opacity duration-200 group-hover:opacity-0 group-active:opacity-0 ${badgeStyles[game.tag]}`}
          >
            <BadgeIcon size={10} strokeWidth={2.5} />
            {game.tag}
          </span>
        )}

        {game.isSponsored && (
          <span className="absolute right-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/85 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-0 group-active:opacity-0">
            {game.sponsorLabel || "Sponsored"}
          </span>
        )}

        <p className="absolute inset-x-0 bottom-0 truncate px-2.5 py-2 font-display text-sm font-bold leading-none text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
          {game.title}
        </p>
      </div>
    </Link>
  );
}
