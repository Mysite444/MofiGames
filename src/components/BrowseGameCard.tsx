"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { RefreshCw, Sparkles, Trophy, Flame } from "lucide-react";
import { GameThumbnail } from "./GameThumbnail";
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
 * Same visual treatment as CategoryPageCard (16:9, no caption, hover ring +
 * preview video) but for cross-category listings — /games, search results,
 * etc. — where the category has to be resolved from a merged real+
 * placeholder list rather than the static-only one CategoryPageCard reads
 * from internally.
 */
export function BrowseGameCard({ game, category }: { game: Game; category: Category | undefined }) {
  const [previewActive, setPreviewActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  if (!game.thumbnailUrl && !category) return null;

  const BadgeIcon = game.tag ? badgeIcons[game.tag] : null;

  function startPreview() {
    if (!game.previewVideoUrl) return;
    setPreviewActive(true);
    videoRef.current?.play().catch(() => {});
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
      <div className="tile-shine relative aspect-video w-full overflow-hidden rounded-xl ring-1 ring-white/10 transition-all duration-200 group-hover:scale-[1.03] group-hover:ring-2 group-hover:ring-[rgba(145,70,255,0.5)] group-hover:shadow-[0_6px_20px_rgba(0,0,0,0.4)] group-focus-visible:ring-2 group-focus-visible:ring-[rgba(145,70,255,0.5)] group-active:scale-[0.97]">
        {game.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={game.thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
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
      <p className="mt-1.5 truncate px-0.5 text-xs font-semibold text-text-muted transition-colors group-hover:text-white">
        {game.title}
      </p>
    </Link>
  );
}
