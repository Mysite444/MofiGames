"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { GameThumbnail } from "./GameThumbnail";
import { useMergedCategoryBySlug } from "@/lib/supabase/real-games-client";
import { getGameCover } from "@/lib/game-cover";
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
  const videoRef = useRef<HTMLVideoElement>(null);
  // Square cover (1:1) matches this card's aspect-square container.
  // Falls back to thumbnailUrl → coverImageUrl → gradient placeholder.
  const imageSrc = getGameCover(game, "square");
  if (!imageSrc && !category) return null;

  // Hover-preview: a short, silent, looping clip that plays over the
  // thumbnail on hover/focus, same behavior as CrazyGames' game cards.
  // Only real (database-backed) games can have one — placeholder/demo
  // games never set previewVideoUrl.
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
      className="group block w-full focus-visible:outline-none"
      onMouseEnter={startPreview}
      onMouseLeave={stopPreview}
      onFocus={startPreview}
      onBlur={stopPreview}
    >
      <div className="tile-shine relative aspect-square w-full overflow-hidden rounded-2xl ring-1 ring-white/10 transition-all duration-200 group-hover:scale-[1.03] group-hover:ring-2 group-hover:ring-white group-hover:shadow-[0_6px_20px_rgba(0,0,0,0.4)] group-focus-visible:ring-2 group-focus-visible:ring-white group-active:scale-[0.97]">
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

        {game.tag && (
          <span
            className={`absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide transition-opacity duration-200 group-hover:opacity-0 group-active:opacity-0 ${tagStyles[game.tag]}`}
          >
            {game.tag}
          </span>
        )}

        {game.isSponsored && (
          <span className="absolute right-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white/85 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-0 group-active:opacity-0">
            {game.sponsorLabel || "Sponsored"}
          </span>
        )}

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
