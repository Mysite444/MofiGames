"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Play,
  Users,
  ThumbsUp,
  ThumbsDown,
  Bookmark,
  Share2,
  MessageSquare,
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
import { GameContentSection } from "./GameContentSection";
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
   * same in-post placement as the desktop game page (GameDetailsSection). */
  customHtmlAds?: AdPlacementConfig;
  adsenseClientId?: string | null;
  adsenseReady?: boolean;
}) {
  const Icon = iconMap[category.icon];

  // Like/dislike are optimistic, local-only. Favorite and recently-played
  // are real — backed by localStorage via lib/game-library.ts.
  const [playing, setPlaying] = useState(false);
  const [vote, setVote] = useState<"up" | "down" | null>(null);

  // Real playtime tracking — streams elapsed seconds while `playing` is true.
  usePlayTimeTracking(playing);

  // Auto-start: launch the landscape player on mount so users go straight
  // into the game. recordPlayed is called here so the game shows up in
  // /recently-played even if the visitor closes before the iframe loads.
  useEffect(() => {
    recordPlayed(game.slug);
    setPlaying(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const favorited = useIsFavorited(game.slug);
  const baseLikes = Math.round(game.plays * 0.92);

  // Derived metadata for Card 1 — Game Info section
  const isRealGame = Boolean(game.developer || game.publisher || game.releaseDate || game.version);
  const releasedLabel = game.releaseDate
    ? new Date(game.releaseDate).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : null;
  const orientationLabel = game.orientation === "portrait" ? "Portrait" : "Landscape";

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

        {/* ════════════════════════════════════════════════════════════════
            Card 1 — Ad · Game Info · Tags
            ────────────────────────────────────────────────────────────
            Now the FIRST card on mobile, matching both the CrazyGames mobile
            reference screenshots and the desktop GameDetailsSection order
            (info/tags before about-content). Key differences from the old
            Card 2:
              • No "GAME INFO" / "TAGS" section-header labels — CrazyGames
                mobile doesn't show those uppercase headers; the rows and chips
                speak for themselves.
              • Tags render in a 2-column grid instead of a flex-wrap row —
                mirrors the CrazyGames reference exactly (two chips per row).
              • Tag chips are rectangular (rounded-xl) not fully pill-shaped
                (rounded-full) — matches the reference chip style.
              • Count rendered in the site's accent blue (#3DA9FC) so it reads
                as data, not decoration — consistent with CrazyGames purple.
            Uses .game-post-card-1 (delay 0.08 s) so it enters first and the
            content card cascades in 140 ms behind it.
            ════════════════════════════════════════════════════════════ */}
        <div className="game-post-card-1 glass flex flex-col overflow-hidden rounded-2xl">

          {/* ── Section 1: Ad slot ─────────────────────────────────────── */}
          <div className="flex items-center justify-center border-b border-white/[0.06] px-4 py-4">
            <GamePostAdSlot
              config={customHtmlAds ?? { enabled: false, slotId: null, code: null }}
              adsenseClientId={adsenseClientId}
              adsenseReady={adsenseReady}
            />
          </div>

          {/* ── Section 2: Game info rows — no section header ─────────── */}
          <dl className="flex flex-col gap-2.5 border-b border-white/[0.06] px-4 py-4 text-sm">

            {/* Category */}
            <MobileStatRow label="Category" index={0}>
              {category.name}
            </MobileStatRow>

            {/* Release date — show only if available */}
            {releasedLabel && (
              <MobileStatRow label="Released" index={1}>
                {releasedLabel}
              </MobileStatRow>
            )}

            {/* Developer / Publisher / Version — real games only */}
            {game.developer && (
              <MobileStatRow label="Developer" index={2}>
                {game.developer}
              </MobileStatRow>
            )}
            {game.publisher && (
              <MobileStatRow label="Publisher" index={3}>
                {game.publisher}
              </MobileStatRow>
            )}
            {game.version && (
              <MobileStatRow label="Version" index={4}>
                {game.version}
              </MobileStatRow>
            )}

            {/* Always-present metadata */}
            <MobileStatRow label="Platform" index={isRealGame ? 5 : 2}>
              {game.mobileSupport === false ? "Desktop only" : "Browser (all devices)"}
            </MobileStatRow>

            <MobileStatRow label="Orientation" index={isRealGame ? 6 : 3}>
              {orientationLabel}
            </MobileStatRow>

            <MobileStatRow label="Rating" index={isRealGame ? 7 : 4}>
              {game.rating} / 5
              {game.ratingCount != null && game.ratingCount > 0 && (
                <span className="ml-1 text-text-faint">
                  ({game.ratingCount.toLocaleString()} votes)
                </span>
              )}
            </MobileStatRow>
          </dl>

          {/* ── Section 3: Tags — 2-column grid, rectangular chips ────── */}
          <div className="grid grid-cols-2 gap-2 px-4 py-4">
            {game.tag && <MobileTagPill label={game.tag} variant="hot" index={0} />}
            <MobileTagPill label={category.name} index={game.tag ? 1 : 0} />
            {game.multiplayer ? (
              <MobileTagPill label="Multiplayer" index={game.tag ? 2 : 1} />
            ) : (
              <MobileTagPill label="Singleplayer" index={game.tag ? 2 : 1} />
            )}
            <MobileTagPill label="Browser" index={game.tag ? 3 : 2} />
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════
            Card 2 — About this game
            ────────────────────────────────────────────────────────────
            Now the SECOND card on mobile, matching both the CrazyGames mobile
            reference and the desktop GameDetailsSection order. Key differences
            from the old Card 1:
              • "How to play" heading is now text-xl (was text-base) and
                includes the game title — "How to play {game.title}" — matching
                the prominent "How to Play Bloxd.io" heading in the reference.
              • gap-5 (was gap-4) adds slightly more breathing room between
                the intro blurb, rich content, and the How to play block.
            Uses .game-post-card-2 (delay 0.22 s) so it cascades in after
            Card 1, same timing as desktop.
            ════════════════════════════════════════════════════════════ */}
        {((game.description && game.description.trim().length > 0) ||
          (game.content && game.content.trim().length > 0) ||
          (game.instructions && game.instructions.trim().length > 0)) && (
          <section className="game-post-card-2 glass flex flex-col gap-5 rounded-2xl p-4">
            {game.description && game.description.trim().length > 0 && (
              <p className="text-sm leading-relaxed text-text-muted">{game.description}</p>
            )}

            <GameContentSection html={game.content} />

            {game.instructions && game.instructions.trim().length > 0 && (
              <div className="flex flex-col gap-2">
                {/* Prominent heading matching the CrazyGames "How to Play {title}"
                    section title in the mobile reference screenshots.
                    Upgraded from text-base → text-xl so it reads as a real
                    section break rather than a sub-label. */}
                <h2 className="font-display text-xl font-bold text-text">
                  How to play {game.title}
                </h2>
                <p className="text-sm leading-relaxed text-text-muted">{game.instructions}</p>
              </div>
            )}
          </section>
        )}

        {/* More in this category */}
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

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * A key-value row inside Card 1's "Game Info" section on mobile.
 * Two-column justify-between layout: label (faint) on the left,
 * value (semibold white) on the right — matches the CrazyGames mobile
 * reference style. Stagger delay from `index` unchanged.
 */
function MobileStatRow({
  label,
  index,
  children,
}: {
  label: string;
  /** 0-based — controls the stagger delay (0.32 s + index × 55 ms). */
  index: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="game-post-stat-row flex items-baseline justify-between gap-2"
      style={{ animationDelay: `${0.32 + index * 0.055}s` }}
    >
      <dt className="shrink-0 text-text-faint">{label}</dt>
      <dd className="text-right font-semibold text-text">{children}</dd>
    </div>
  );
}

/**
 * A tag chip inside Card 1's "Tags" 2-column grid on mobile.
 *
 * Updated to match the CrazyGames mobile reference:
 *   • rounded-xl (rectangular) instead of rounded-full (pill) — the
 *     reference uses a squarish chip, not a full pill shape.
 *   • justify-between layout: label on the left, count on the right —
 *     mirrors the "label  COUNT" pattern in the CrazyGames tag grid
 *     (e.g. ".io  94", "Mobile  2,436").
 *   • Count is rendered in the site accent blue (#3DA9FC) so it reads as
 *     quantitative data, not decoration — CrazyGames uses their purple
 *     accent for the same purpose.
 *   • py-2 (was py-1) for a taller, finger-friendly touch target inside
 *     the 2-column grid.
 *
 * The hot variant spans both columns via col-span-2 (it's a promo badge,
 * not a category count) and keeps its full-width red accent styling.
 */
function MobileTagPill({
  label,
  count,
  variant,
  index,
}: {
  label: string;
  count?: number;
  variant?: "hot";
  /** 0-based — controls the pop-in stagger (0.44 s + index × 60 ms). */
  index: number;
}) {
  const delay = `${0.44 + index * 0.06}s`;

  if (variant === "hot") {
    return (
      <span
        className="game-post-tag-pill col-span-2 flex items-center justify-between rounded-xl bg-hot/15 px-3 py-2 text-sm font-bold text-hot hover:bg-hot/25"
        style={{ animationDelay: delay }}
      >
        <span>{label}</span>
        {count !== undefined && <span>{count}</span>}
      </span>
    );
  }

  return (
    <span
      className="game-post-tag-pill glass flex items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold"
      style={{ animationDelay: delay }}
    >
      <span className="truncate text-text-muted">{label}</span>
      {count !== undefined && (
        <span className="ml-2 shrink-0 font-bold text-[#3DA9FC]">{count}</span>
      )}
    </span>
  );
}
