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
  Star,
  Eye,
  Info,
  Tag as TagIcon,
} from "lucide-react";
import { MobileLandscapePlayer } from "./MobileLandscapePlayer";
import { HoverPreviewVideo } from "./HoverPreviewVideo";
import { GameThumbnail } from "./GameThumbnail";
import { getGameCover } from "@/lib/game-cover";
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

  // 16:9 cover — same source PlayFrame uses on the PC game page
  // (landscapeCoverUrl → thumbnailUrl → coverImageUrl → undefined). Used
  // as the hero's resting-state background (in place of the bare category
  // gradient) and by the centered thumbnail card below, so both places
  // show the game's real artwork instead of a decorative placeholder.
  const heroCoverUrl = getGameCover(game, "landscape");
  const [heroVideoError, setHeroVideoError] = useState(false);
  const hasHeroVideo = Boolean(game.previewVideoUrl?.trim()) && !heroVideoError;

  // Real playtime tracking — see lib/game-library.ts. Streams actual
  // elapsed seconds to the signed-in account while `playing` is true.
  usePlayTimeTracking(playing);


  const favorited = useIsFavorited(game.slug);
  const baseLikes = Math.round(game.plays * 0.92);

  // Derived metadata for Card 2 ─ Game Info section
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

      {/*
       * ── Mobile hero — CrazyGames-style full-bleed background video ────
       *
       * Layout (bottom-to-top stacking order):
       *   1. Category gradient   — always-visible base fallback (inline style),
       *                            used only when the game has no cover image
       *                            of its own either.
       *   2. heroCoverUrl        — the game's real 16:9 cover (getGameCover),
       *                            same source PlayFrame's resting state uses
       *                            on the PC game page. Always rendered under
       *                            the video (also doubles as its poster), so
       *                            the moment the video is missing, blocked,
       *                            or errors out, the real artwork shows
       *                            instead of the bare gradient.
       *   3. previewVideoUrl     — muted + looped, always "active" here
       *                            since there's no hover concept on a
       *                            touch screen. Renders via the same
       *                            HoverPreviewVideo used by the hover
       *                            preview elsewhere, so a direct MP4/WebM
       *                            *or* a YouTube link both work. Paste
       *                            either into Admin → Edit Game →
       *                            "Preview Video" field. Independent of
       *                            videoTrailerUrl — that field only ever
       *                            renders in the dedicated "Trailer"
       *                            section further down the page.
       *   4. Dark scrim          — bg-black/45, keeps thumbnail legible
       *   5. Bottom fade         — dissolves hero into the page background
       *   6. Thumbnail card      — centred game artwork (same cover) + title
       *
       * PlayFrame is intentionally absent here: on mobile the actual game
       * runs inside MobileLandscapePlayer (portal, full-screen), so PlayFrame
       * would only be a decorative background box with a nested <video> —
       * keeping the video at this level gives true full-bleed coverage with
       * no intermediate wrapper clipping or gradient conflicts.
       */}
      <div
        id={HERO_ID}
        className="relative w-full overflow-hidden aspect-[4/3]"
        style={{
          background: `linear-gradient(135deg, ${category.colorTo}, ${category.colorFrom})`,
        }}
      >
        {/* Decorative category icon — mirrors PlayFrame's watermark */}
        <Icon
          size={220}
          strokeWidth={1}
          className="pointer-events-none absolute -right-8 -bottom-10 text-white/10"
          aria-hidden
        />

        {/*
         * Static cover — always rendered first (when the game has one) so
         * it's the resting-state background, exactly like PlayFrame's
         * coverImageUrl on the PC game page. Category gradient (inline
         * style on the parent div) is the last-resort fallback beneath it.
         */}
        {heroCoverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroCoverUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}

        {/*
         * Background video — previewVideoUrl only (see comment above).
         * Sits on top of the cover image and hides it while playing; if
         * the clip errors out, onError flips hasHeroVideo off and the
         * cover underneath is what's left visible.
         */}
        {hasHeroVideo && (
          <HoverPreviewVideo
            src={game.previewVideoUrl!}
            active
            onError={() => setHeroVideoError(true)}
          />
        )}

        {/* Dark scrim — dims video/gradient so content stays readable */}
        <div aria-hidden className="absolute inset-0 bg-black/45" />

        {/* Bottom fade — dissolves the hero into the dark page background */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[var(--color-base)] to-transparent"
        />

        {/* Centred thumbnail card */}
        {!playing && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative w-56 overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/15">
              {heroCoverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={heroCoverUrl}
                  alt=""
                  className="aspect-video w-full object-cover"
                />
              ) : (
                <GameThumbnail category={category} variant={game.variant} className="aspect-video w-full" />
              )}
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
            className="flex items-center gap-1.5 text-xs font-medium text-white"
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
            <span className="flex items-center gap-1.5 text-white">
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
            yet either, but kept as two distinct CTAs to match the reference.
            "Play now" is the primary CTA: shorter + a touch wider than the
            pill below it, squared-off corners (rounded-xl, not rounded-full)
            and the site's shared CTA blue (--color-cta-blue — same token as
            "Back to Game" / pagination) instead of white, so it reads as a
            big, wide, CrazyGames-style play button rather than a slim pill. */}
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={handlePlay}
            className="-mx-2 flex items-center justify-center gap-2 rounded-xl py-4 text-base font-bold text-white shadow-lg transition-transform active:scale-[0.98]"
            style={{
              background: "var(--color-cta-blue)",
              boxShadow:
                "0 4px 20px rgba(var(--color-cta-blue-rgb), 0.35), 0 2px 8px rgba(0,0,0,0.3)",
            }}
          >
            <Play size={18} className="fill-white" />
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
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/40 bg-black px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:border-white/70"
          >
            <ThumbsUp size={16} className={vote === "up" ? "fill-white" : ""} />
            {formatPlays(baseLikes + (vote === "up" ? 1 : 0))}
          </button>

          <button
            type="button"
            onClick={() => setVote((v) => (v === "down" ? null : "down"))}
            aria-pressed={vote === "down"}
            aria-label="Dislike"
            className="flex shrink-0 items-center justify-center rounded-lg border border-white/40 bg-black p-2.5 text-white transition-colors hover:border-white/70"
          >
            <ThumbsDown size={16} className={vote === "down" ? "fill-white" : ""} />
          </button>

          <button
            type="button"
            onClick={() => toggleFavorite(game.slug)}
            aria-pressed={favorited}
            aria-label={favorited ? "Remove bookmark" : "Bookmark game"}
            className={`flex shrink-0 items-center justify-center rounded-lg border bg-black p-2.5 transition-colors hover:border-white/70 ${
              favorited ? "border-[#3DA9FC]/60 text-[#3DA9FC]" : "border-white/40 text-white"
            }`}
          >
            <Bookmark size={16} className={favorited ? "fill-[#3DA9FC]" : ""} />
          </button>

          <button
            type="button"
            onClick={handleShare}
            aria-label="Share"
            className="flex shrink-0 items-center justify-center rounded-lg border border-white/40 bg-black p-2.5 text-white transition-colors hover:border-white/70"
          >
            <Share2 size={16} />
          </button>

          <Link
            href="/contact"
            aria-label="Send feedback"
            className="flex shrink-0 items-center justify-center rounded-lg border border-white/40 bg-black p-2.5 text-white transition-colors hover:border-white/70"
          >
            <MessageSquare size={16} />
          </Link>
        </div>

        {/* ════════════════════════════════════════════════════════════════
            Card 1 — Ad · Game Info · Tags
            Mirrors the mofigames.com reference layout: this info card sits
            directly under the like/dislike/bookmark/share row and ABOVE the
            game's written content, not below it. Three hairline-divided
            sections:
              1. Ad slot  (Admin → Monetization → Custom HTML Ads)
              2. Game Info  (Category, Released, Platform, Orientation, Rating …)
              3. Tags  (category, multiplayer, browser …)
            Slides up first (see .game-post-card-1 in globals.css), then
            lifts on hover. Stat rows stagger in from the left; tag pills
            spring-pop with individual delays. All defined in globals.css.
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

          {/* ── Section 2: Game info ──────────────────────────────────── */}
          <div className="flex flex-col gap-3 border-b border-white/[0.06] px-4 py-4">
            <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-text-faint">
              <Info size={12} className="shrink-0" />
              Game Info
            </h2>

            <dl className="flex flex-col gap-2 text-sm">
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
          </div>

          {/* ── Section 3: Tags ───────────────────────────────────────── */}
          <div className="flex flex-col gap-3 px-4 py-4">
            <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-text-faint">
              <TagIcon size={12} className="shrink-0" />
              Tags
            </h2>

            <div className="flex flex-wrap gap-2">
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
        </div>

        {/* ════════════════════════════════════════════════════════════════
            Card 2 — About this game
            Same structured "board" panel as the desktop (GameDetailsSection):
            intro blurb, long-form How to Play / Tips / Features / FAQ content
            authored in the admin "Content" field, and the short "How to play"
            blurb — all inside one boxed glass card. Rendered AFTER the Game
            Info / Tags card above; slides up + fades in on mount via
            .game-post-card-2 defined in globals.css.
            Controls intentionally isn't shown here — it lives in the
            "Game controls" popover on the play screen itself (PlayerActionBar).
            ════════════════════════════════════════════════════════════ */}
        {((game.description && game.description.trim().length > 0) ||
          (game.content && game.content.trim().length > 0) ||
          (game.instructions && game.instructions.trim().length > 0)) && (
          <section className="game-post-card-2 glass flex flex-col gap-4 rounded-2xl p-4">
            {game.description && game.description.trim().length > 0 && (
              <p className="text-sm leading-relaxed text-text-muted">{game.description}</p>
            )}

            <GameContentSection html={game.content} />

            {game.instructions && game.instructions.trim().length > 0 && (
              <div>
                <h2 className="mb-1 font-display text-base font-bold text-text">How to play</h2>
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
 * A key-value row inside Card 2's "Game Info" section on mobile.
 * Uses a two-column justify-between layout to match the existing mobile Row
 * pattern while picking up the stagger animation from globals.css.
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
 * A tag chip inside Card 2's "Tags" section on mobile.
 * Smaller padding than desktop to fit comfortably on narrow screens.
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
        className="game-post-tag-pill flex items-center rounded-full bg-hot/15 px-3 py-1 text-xs font-bold text-hot hover:bg-hot/25"
        style={{ animationDelay: delay }}
      >
        {label}
        {count !== undefined && <span className="ml-1">{count}</span>}
      </span>
    );
  }

  return (
    <span
      className="game-post-tag-pill glass flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-text-muted"
      style={{ animationDelay: delay }}
    >
      {label}
      {count !== undefined && <span className="font-bold text-text">{count}</span>}
    </span>
  );
}
