"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Play } from "lucide-react";
import { getGameCover } from "@/lib/game-cover";
import { GameThumbnail } from "@/components/GameThumbnail";
import { useMergedCategoryBySlug } from "@/lib/supabase/real-games-client";
import type { MobileTemplateSectionProps } from "./MobileTemplateProps";
import type { Game } from "@/lib/types";

const TAG_STYLES: Record<string, string> = {
  TOP: "bg-gold text-[#221a00]",
  HOT: "bg-hot text-white",
  NEW: "glass-strong text-white",
  UPDATED: "glass-strong text-white",
};

/**
 * Template 1 — Hero Video
 *
 * Full-width 16:9 hero panel. Shows a muted looping preview video that
 * autoplays when the section enters the viewport (Intersection Observer).
 * Falls back gracefully to the poster image when:
 *   • no previewVideoUrl is set on the game
 *   • the browser blocks autoplay
 *   • the device is on a slow connection
 *
 * Tapping the Play button navigates to the game page (same behaviour as
 * CrazyGames — the preview is just a teaser; the actual game loads on the
 * game page). Only uses the first game in the array.
 */
function HeroGameCard({ game }: { game: Game }) {
  const category = useMergedCategoryBySlug(game.categorySlug);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState(false);

  const posterSrc = getGameCover(game, "landscape");
  const hasVideo = Boolean(game.previewVideoUrl) && !videoError;

  // Autoplay when the hero enters the viewport; pause when it leaves.
  // Intersection Observer avoids downloading video bytes until the user
  // actually reaches this section (especially important on slow mobile).
  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (!videoRef.current || !hasVideo) return;
      if (entry.isIntersecting) {
        videoRef.current.play().catch(() => {
          // Autoplay blocked — poster image stays visible, which is fine.
          setVideoError(true);
        });
      } else {
        videoRef.current.pause();
      }
    },
    [hasVideo]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !hasVideo) return;
    const observer = new IntersectionObserver(handleIntersection, {
      threshold: 0.3,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleIntersection, hasVideo]);

  if (!category && !posterSrc) return null;

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden rounded-2xl ring-1 ring-white/10">
      {/* Aspect box — 16:9 */}
      <div className="relative aspect-video w-full">
        {/* Background gradient (always rendered) */}
        {category && (
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, ${category.colorTo} 0%, ${category.colorFrom} 100%)`,
            }}
            aria-hidden
          />
        )}

        {/* Poster image */}
        {posterSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={posterSrc}
            alt=""
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
              videoReady && hasVideo ? "opacity-0" : "opacity-100"
            }`}
            loading="lazy"
          />
        )}

        {/* Preview video — muted, looping, lazy */}
        {game.previewVideoUrl && !videoError && (
          <video
            ref={videoRef}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
              videoReady ? "opacity-100" : "opacity-0"
            }`}
            src={game.previewVideoUrl}
            muted
            loop
            playsInline
            preload="none"
            poster={posterSrc}
            onCanPlay={() => setVideoReady(true)}
            onError={() => setVideoError(true)}
          />
        )}

        {/* Dark vignette */}
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent"
          aria-hidden
        />

        {/* Tag badge */}
        {game.tag && (
          <span
            className={`absolute left-3 top-3 rounded-md px-2 py-1 text-[11px] font-bold tracking-wide ${TAG_STYLES[game.tag]}`}
          >
            {game.tag}
          </span>
        )}

        {/* Bottom info + play button */}
        <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-bold leading-tight text-white">
              {game.title}
            </p>
            {category && (
              <p className="mt-0.5 text-xs font-medium text-white/60">{category.name}</p>
            )}
          </div>
          <Link
            href={`/${game.slug}`}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#0b0c14] shadow-lg transition-transform active:scale-95"
            aria-label={`Play ${game.title}`}
          >
            <Play size={14} className="fill-[#0b0c14]" aria-hidden />
            Play
          </Link>
        </div>
      </div>
    </div>
  );
}

export function MobileTemplate1Hero({
  games,
  title,
  subtitle,
  viewAllHref,
  accent = "#ffffff",
  showViewAll = true,
}: MobileTemplateSectionProps) {
  const game = games[0];
  if (!game) return null;

  return (
    <section className="flex flex-col gap-3">
      {/* Section header */}
      <div className="flex items-center justify-between px-4">
        <div>
          <h2 className="font-category-fat text-[17px] leading-tight text-white">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>}
        </div>
        {showViewAll && viewAllHref && (
          <Link
            href={viewAllHref}
            className="text-[13px] font-semibold text-text-muted hover:text-white"
          >
            See all
          </Link>
        )}
      </div>

      {/* Hero card */}
      <div className="px-4">
        <HeroGameCard game={game} />
      </div>
    </section>
  );
}
