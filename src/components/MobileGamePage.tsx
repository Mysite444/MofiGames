"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Play,
  Users,
  ThumbsUp,
  ThumbsDown,
  Bookmark,
  Share2,
  MessageSquare,
  ChevronDown,
  Star,
  Eye,
} from "lucide-react";
import { PlayFrame } from "./PlayFrame";
import { MobileLandscapePlayer } from "./MobileLandscapePlayer";
import { GameThumbnail } from "./GameThumbnail";
import { MobileRelatedGrid } from "./MobileRelatedGrid";
import { BackToGameButton } from "./BackToGameButton";
import { CommentsSection } from "./CommentsSection";
import { GamePostAdSlot } from "./GamePostAdSlot";
import { formatPlays } from "@/lib/format-plays";
import { iconMap } from "@/lib/icon-map";
import { recordPlayed, toggleFavorite, useIsFavorited, usePlayTimeTracking } from "@/lib/game-library";
import type { AdPlacementConfig } from "./AdUnit";
import type { Category, Game } from "@/lib/types";

const HERO_ID = "game-hero";

export function MobileGamePage({
  game,
  category,
  related,
  customHtmlAds,
  adsenseClientId,
  adsenseReady,
}: {
  game: Game;
  category: Category;
  related: Game[];
  /** Admin → Monetization → Advertisement Management → Custom HTML Ads —
   * same in-post placement as the desktop game page (GameDetailsSection);
   * this was previously never wired up here, so it never rendered on
   * mobile regardless of the admin toggle. */
  customHtmlAds?: AdPlacementConfig;
  adsenseClientId?: string | null;
  adsenseReady?: boolean;
}) {
  const Icon = iconMap[category.icon];

  // Like/dislike are optimistic, local-only — there's no backend yet to
  // persist them, so they're UI feedback rather than a real vote system.
  // Favorite and recently-played are real, though — both are backed by
  // localStorage via lib/game-library.ts (see /favorites and /recently-played).
  const [playing, setPlaying] = useState(false);
  const [vote, setVote] = useState<"up" | "down" | null>(null);

  // Real playtime tracking — see lib/game-library.ts. Streams actual
  // elapsed seconds to the signed-in account while `playing` is true.
  usePlayTimeTracking(playing);
  const favorited = useIsFavorited(game.slug);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const baseLikes = Math.round(game.plays * 0.92);

  function handlePlay() {
    setPlaying(true);
    recordPlayed(game.slug);
  }

  function handleClose() {
    setPlaying(false);
  }

  async function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) {
      try {
        await navigator.share({ title: game.title, url });
      } catch {
        // user cancelled the share sheet — nothing to do
      }
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
    }
  }

  return (
    <div className="flex flex-col gap-4 -mt-3 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:hidden">

      {/*
       * ── Landscape player overlay ─────────────────────────────────────
       * Rendered through a portal straight into <body> at z-[10060] — above
       * the header (10000) and mobile drawer/action-sheet (10050) — so it
       * always covers the whole screen, including the mobile hamburger menu,
       * with nothing poking through on real devices. See the file-level
       * comment in MobileLandscapePlayer.tsx for why the portal is needed.
       * Strategy:
       *   1. requestFullscreen() + screen.orientation.lock("landscape")
       *      → works on Android Chrome; the OS itself rotates.
       *   2. CSS fallback: the inner container is rotated 90° and given
       *      swapped viewport dimensions (100dvh × 100dvw) so the iframe
       *      fills the screen in landscape without requiring physical rotation.
       *      → works on iOS Safari and any browser that blocks Layer 1.
       * Closed by tapping ✕, pressing Escape, or the hardware/browser Back
       * button (intercepted via history/popstate) — every path unmounts this
       * overlay, which locks the orientation back to portrait automatically.
       */}
      {playing && (
        <MobileLandscapePlayer
          playUrl={game.playUrl}
          title={game.title}
          orientation={game.orientation}
          onClose={handleClose}
        />
      )}

      {/* Hero — always shows the thumbnail preview.
          PlayFrame is kept here for its preview-video background and the
          in-frame Play button tap (which also calls handlePlay).
          We never pass `playing={true}` here: the iframe lives exclusively
          inside MobileLandscapePlayer above, keeping this hero as a clean
          thumbnail/preview area even after the player is closed. */}
      <div id={HERO_ID} className="relative w-full overflow-hidden">
        <PlayFrame
          category={category}
          bleed
          heightClassName="aspect-[4/3]"
          playing={false}
          onPlay={handlePlay}
          previewVideoUrl={game.previewVideoUrl}
          orientation={game.orientation}
          title={game.title}
        />

        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[var(--color-base)] to-transparent"
        />

        {!playing && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative w-56 overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/15">
              <GameThumbnail category={category} variant={game.variant} className="aspect-video w-full" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 pt-7 pb-2">
                <span className="block truncate text-sm font-bold text-white">{game.title}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 px-4">
        {/* Title block — centered, same concept as image 1 */}
        <div className="flex flex-col items-center gap-1.5 text-center">
          <h1 className="font-display text-xl font-bold text-text">{game.title}</h1>
          <Link
            href={`/${category.slug}`}
            className="flex items-center gap-1.5 text-xs font-medium"
            style={{ color: category.colorFrom }}
          >
            <Icon size={12} />
            {category.name}
          </Link>
          <div className="flex items-center gap-3 text-sm text-text-muted">
            <span className="flex items-center gap-1.5 font-semibold text-text">
              <Star size={14} className="fill-gold text-gold" />
              {game.rating}
            </span>
            <span aria-hidden>·</span>
            <span className="flex items-center gap-1.5">
              <Eye size={14} />
              {formatPlays(game.plays)} plays
            </span>
            {game.tag && (
              <span className="rounded-full bg-hot/15 px-2 py-0.5 text-[11px] font-bold text-hot">
                {game.tag}
              </span>
            )}
          </div>
        </div>

        {/* Play now / Play with friends — both just start the same
            front-end placeholder above since there's no multiplayer backend
            yet either, but kept as two distinct CTAs to match the reference. */}
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={handlePlay}
            className="flex items-center justify-center gap-2 rounded-full bg-white py-3 text-sm font-bold text-[#0b0c14] shadow-lg transition-transform active:scale-[0.98]"
          >
            <Play size={16} className="fill-[#0b0c14]" />
            Play now
          </button>
          {game.multiplayer ? (
            <button
              type="button"
              onClick={handlePlay}
              className="glass-strong flex items-center justify-center gap-2 rounded-full py-3 text-sm font-bold text-white transition-transform active:scale-[0.98]"
            >
              <Users size={16} />
              Play with friends
            </button>
          ) : (
            <div
              aria-hidden
              className="invisible flex items-center justify-center gap-2 rounded-full py-3 text-sm font-bold"
            >
              <Users size={16} />
              Play with friends
            </div>
          )}
        </div>

        {/* Action row: like / dislike / favorite / share / feedback */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
          <button
            type="button"
            onClick={() => setVote((v) => (v === "up" ? null : "up"))}
            aria-pressed={vote === "up"}
            className={`glass flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
              vote === "up" ? "text-gold" : "text-text-muted"
            }`}
          >
            <ThumbsUp size={16} className={vote === "up" ? "fill-gold" : ""} />
            {formatPlays(baseLikes + (vote === "up" ? 1 : 0))}
          </button>

          <button
            type="button"
            onClick={() => setVote((v) => (v === "down" ? null : "down"))}
            aria-pressed={vote === "down"}
            aria-label="Dislike"
            className={`glass flex shrink-0 items-center justify-center rounded-full p-2.5 transition-colors ${
              vote === "down" ? "text-hot" : "text-text-muted"
            }`}
          >
            <ThumbsDown size={16} className={vote === "down" ? "fill-hot" : ""} />
          </button>

          <button
            type="button"
            onClick={() => toggleFavorite(game.slug)}
            aria-pressed={favorited}
            aria-label={favorited ? "Remove bookmark" : "Bookmark game"}
            className={`glass flex shrink-0 items-center justify-center rounded-full p-2.5 transition-colors ${
              favorited ? "text-[#3DA9FC]" : "text-text-muted"
            }`}
          >
            <Bookmark size={16} className={favorited ? "fill-[#3DA9FC]" : ""} />
          </button>

          <button
            type="button"
            onClick={handleShare}
            aria-label="Share"
            className="glass flex shrink-0 items-center justify-center rounded-full p-2.5 text-text-muted"
          >
            <Share2 size={16} />
          </button>

          <Link
            href="/contact"
            aria-label="Send feedback"
            className="glass flex shrink-0 items-center justify-center rounded-full p-2.5 text-text-muted"
          >
            <MessageSquare size={16} />
          </Link>
        </div>

        {/* In-post ad slot — same placement/config as the desktop game page
            (Admin → Monetization → Advertisement Management → Custom HTML
            Ads); renders nothing when that placement is off. */}
        <div className="flex justify-center">
          <GamePostAdSlot
            config={customHtmlAds ?? { enabled: false, slotId: null, code: null }}
            adsenseClientId={adsenseClientId}
            adsenseReady={adsenseReady}
          />
        </div>

        {/* Expand/collapse toggle — reveals the same structured facts as the
            desktop "About this game" panel, not the long-form article copy. */}
        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          aria-expanded={detailsOpen}
          className="flex w-full items-center justify-center gap-1.5 py-1 text-text-faint"
        >
          <ChevronDown
            size={20}
            className={`transition-transform duration-200 ${detailsOpen ? "rotate-180" : ""}`}
          />
        </button>

        {detailsOpen && (
          <div className="glass flex flex-col gap-2 rounded-2xl p-4 text-sm">
            <Row label="Category" value={category.name} />
            <Row label="Platform" value={game.mobileSupport === false ? "Browser (desktop only)" : "Browser (all devices)"} />
            <Row label="Players" value={formatPlays(game.plays)} />
            <Row label="Rating" value={`${game.rating} / 5 (${(game.ratingCount ?? 0).toLocaleString()})`} />
            <Row label="Favorites" value={(game.favoriteCount ?? 0).toLocaleString()} />
            {game.developer ? <Row label="Developer" value={game.developer} /> : null}
            {game.publisher ? <Row label="Publisher" value={game.publisher} /> : null}
            {game.version ? <Row label="Version" value={game.version} /> : null}
          </div>
        )}

        <section>
          <h2 className="mb-3 font-display text-base font-bold text-text">More {category.name}</h2>
          <MobileRelatedGrid games={related} />
        </section>

        <CommentsSection game={game} />
      </div>

      <BackToGameButton targetId={HERO_ID} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-text-faint">{label}</dt>
      <dd className="text-text-muted">{value}</dd>
    </div>
  );
}
