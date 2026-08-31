"use client";

import Link from "next/link";
import { Share2, ChevronRight, Bookmark, Info, Tag as TagIcon } from "lucide-react";
import { getGameMeta } from "@/lib/gameMeta";
import { useGamesByCategory } from "@/lib/games-merged";
import { GameContentSection } from "./GameContentSection";
import { RatingStars } from "./RatingStars";
import { GamePostAdSlot } from "./GamePostAdSlot";
import type { AdPlacementConfig } from "./AdUnit";
import type { Category, Game } from "@/lib/types";

export function GameDetailsSection({
  game,
  category,
  customHtmlAds,
  adsenseClientId,
  adsenseReady,
}: {
  game: Game;
  category: Category;
  /** Admin → Monetization → Advertisement Management → Custom HTML Ads —
   * powers the in-post ad slot below. */
  customHtmlAds?: AdPlacementConfig;
  adsenseClientId?: string | null;
  adsenseReady?: boolean;
}) {
  const meta = getGameMeta(game);
  const categoryGames = useGamesByCategory(category.slug);
  const multiplayerCount = categoryGames.filter((g) => g.multiplayer).length;

  // `game.id` is only ever a real UUID for database-backed games — the
  // placeholder generator doesn't set developer/publisher/etc, so this is
  // a reliable signal for "does this game have real admin-entered facts".
  const isRealGame = Boolean(game.developer || game.publisher || game.releaseDate || game.version);

  const releasedLabel = game.releaseDate
    ? new Date(game.releaseDate).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : meta.releasedLabel;
  const orientationLabel = game.orientation === "portrait" ? "Portrait" : "Landscape";

  async function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const nav = typeof navigator !== "undefined" ? navigator : null;
    if (nav?.share) {
      try {
        await nav.share({ title: game.title, url });
        return;
      } catch {
        // user cancelled the native share sheet — fall through to clipboard
      }
    }
    await nav?.clipboard?.writeText(url);
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ══════════════════════════════════════════════════════════════════
          Card 1 — Header (breadcrumb/title/share/rating + ad) · Game Info · Tags
          Mirrors the mofigames.com reference layout exactly: breadcrumb,
          title, share/bookmark and rating sit in the TOP-LEFT of this card,
          with the 300×250 ad slot pinned to the TOP-RIGHT of the same row —
          both live inside the card now, not above it. Below that header row,
          two more sections separated by subtle hairlines:
            1. Header row  — breadcrumb/title/share/rating (left) · ad (right)
            2. Game Info  (Rating, Released, Developer, Platform, Orientation …)
            3. Tags  (category, multiplayer, browser …)
          This card sits ABOVE the game's written content ("About this
          game", Card 2), not below it. Both cards animate in on mount with
          a staggered slide-up defined in globals.css (.game-post-card-1 /
          .game-post-card-2) — card 1 always animates in first, so it
          carries whichever box is rendered first in the DOM.
          ══════════════════════════════════════════════════════════════ */}
      <div className="game-post-card-1 glass flex flex-col overflow-hidden rounded-2xl">

        {/* ── Section 1: Header — breadcrumb/title/share/rating (left) + ad (top right) ── */}
        <div className="flex flex-wrap items-start justify-between gap-6 border-b border-white/[0.06] px-5 py-5">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {/* Breadcrumb nav */}
            <nav className="flex flex-wrap items-center gap-1 text-xs text-text-faint">
              <Link href="/" className="hover:text-text">
                Games
              </Link>
              <ChevronRight size={12} />
              <Link href={`/${category.slug}`} className="hover:text-text">
                {category.name}
              </Link>
              <ChevronRight size={12} />
              <span className="text-text-muted">{game.title}</span>
            </nav>

            {/* Title */}
            <h1 className="font-display text-2xl font-bold text-text sm:text-3xl">{game.title}</h1>

            {/* Share / bookmark */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleShare}
                className="glass flex w-fit items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-text hover:bg-white/10"
              >
                <Share2 size={15} />
                Share
              </button>
              {typeof game.favoriteCount === "number" && game.favoriteCount > 0 && (
                <span className="flex items-center gap-1.5 text-sm text-text-muted">
                  <Bookmark size={14} className="fill-[#3DA9FC] text-[#3DA9FC]" />
                  {game.favoriteCount.toLocaleString()} bookmarks
                </span>
              )}
            </div>

            {/* Rating */}
            {isRealGame ? (
              <RatingStars slug={game.slug} rating={game.rating} ratingCount={game.ratingCount ?? 0} />
            ) : (
              <p className="text-sm text-text-muted">
                <span className="font-bold text-text">{meta.ratingOutOf10}</span>{" "}
                <span className="text-text-muted">({meta.votes.toLocaleString()} votes)</span>
              </p>
            )}
          </div>

          {/* Ad slot — pinned top right, fixed 300×250, never shrinks */}
          <div className="shrink-0">
            <GamePostAdSlot
              config={customHtmlAds ?? { enabled: false, slotId: null, code: null }}
              adsenseClientId={adsenseClientId}
              adsenseReady={adsenseReady}
            />
          </div>
        </div>

        {/* ── Section 2: Game info ───────────────────────────────────────── */}
        <div className="flex flex-col gap-3 border-b border-white/[0.06] px-5 py-4">
          <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-text-faint">
            <Info size={12} className="shrink-0" />
            Game Info
          </h2>

          <dl className="flex flex-col gap-2 text-sm">
            <StatRow label="Rating" index={0}>
              {isRealGame ? (
                <>
                  {game.rating.toFixed(1)} / 5
                  {typeof game.ratingCount === "number" && game.ratingCount > 0 && (
                    <span className="ml-1 font-normal text-text-faint">
                      ({game.ratingCount.toLocaleString()} votes)
                    </span>
                  )}
                </>
              ) : (
                <>
                  {meta.ratingOutOf10}
                  <span className="ml-1 font-normal text-text-faint">
                    ({meta.votes.toLocaleString()} votes)
                  </span>
                </>
              )}
            </StatRow>

            <StatRow label="Released" index={1}>
              {releasedLabel}
            </StatRow>

            {isRealGame ? (
              <>
                {game.developer && (
                  <StatRow label="Developer" index={2}>
                    {game.developer}
                  </StatRow>
                )}
                {game.publisher && (
                  <StatRow label="Publisher" index={3}>
                    {game.publisher}
                  </StatRow>
                )}
                {game.version && (
                  <StatRow label="Version" index={4}>
                    {game.version}
                  </StatRow>
                )}
              </>
            ) : (
              <StatRow label="Game engine" index={2}>
                {meta.gameEngine}
              </StatRow>
            )}

            <StatRow label="Platform" index={isRealGame ? 5 : 3}>
              {game.mobileSupport === false ? "Desktop only" : "Browser (desktop & mobile)"}
            </StatRow>

            <StatRow label="Orientation" index={isRealGame ? 6 : 4}>
              {orientationLabel}
            </StatRow>
          </dl>
        </div>

        {/* ── Section 3: Tags ────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 px-5 py-4">
          <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-text-faint">
            <TagIcon size={12} className="shrink-0" />
            Tags
          </h2>

          <div className="flex flex-wrap gap-2">
            {game.tag && <TagPill label={game.tag} variant="hot" index={0} />}
            <TagPill label={category.name} count={70} index={game.tag ? 1 : 0} />
            {game.multiplayer ? (
              <TagPill
                label="Multiplayer"
                count={multiplayerCount}
                index={game.tag ? 2 : 1}
              />
            ) : (
              <TagPill label="Singleplayer" index={game.tag ? 2 : 1} />
            )}
            <TagPill label="Browser" index={game.tag ? 3 : 2} />
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          Card 2 — About this game
          Intro blurb + long-form content (How to Play / Tips / Features /
          FAQ authored in the admin "Content" field) + "How to play" blurb.
          Rendered AFTER the Game Info / Tags card above. Controls
          intentionally aren't repeated here — they live in the
          "Game controls" popover on the play screen (PlayerActionBar).
          ══════════════════════════════════════════════════════════════ */}
      <div className="game-post-card-2 glass flex flex-col gap-4 rounded-2xl p-5">
        <p className="text-sm leading-relaxed text-text-muted">
          {game.description && game.description.trim().length > 0 ? (
            game.description
          ) : (
            <>
              Jump into {game.title}, a {category.name.toLowerCase()} pick from MofiGames.{" "}
              {category.description} No download, no install — it runs straight in your browser on
              desktop, tablet, or phone.
            </>
          )}
        </p>

        <GameContentSection html={game.content} />

        {game.instructions && game.instructions.trim().length > 0 && (
          <div>
            <h2 className="mb-1 font-display text-base font-bold text-text">How to play</h2>
            <p className="text-sm leading-relaxed text-text-muted">{game.instructions}</p>
          </div>
        )}
      </div>

      {!isRealGame && (
        <div>
          <h2 className="mb-1 font-display text-base font-bold text-text">Last Updated</h2>
          <p className="text-sm text-text-muted">{meta.lastUpdatedFullDate}</p>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * A key-value row inside the Game Info card's "Game Info" section.
 * `index` drives the stagger delay so rows cascade in left-to-right.
 */
function StatRow({
  label,
  index,
  children,
}: {
  label: string;
  /** 0-based position — controls the stagger delay (0.32 s + index × 55 ms). */
  index: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="game-post-stat-row flex flex-wrap items-baseline gap-x-2"
      style={{ animationDelay: `${0.32 + index * 0.055}s` }}
    >
      <dt className="w-32 shrink-0 text-text-faint">{label}:</dt>
      <dd className="font-semibold text-text">{children}</dd>
    </div>
  );
}

/**
 * A pill chip inside the Game Info card's "Tags" section.
 * `index` drives the spring-pop stagger; `variant="hot"` renders the red
 * accent chip used for admin-set promo tags (e.g. "New", "Hot").
 */
function TagPill({
  label,
  count,
  variant,
  index,
}: {
  label: string;
  count?: number;
  variant?: "hot";
  /** 0-based position — controls the pop-in stagger (0.44 s + index × 60 ms). */
  index: number;
}) {
  const delay = `${0.44 + index * 0.06}s`;

  if (variant === "hot") {
    return (
      <span
        className="game-post-tag-pill flex items-center rounded-full bg-hot/15 px-3.5 py-1.5 text-xs font-bold text-hot hover:bg-hot/25"
        style={{ animationDelay: delay }}
      >
        {label}
        {count !== undefined && <span className="ml-1.5">{count}</span>}
      </span>
    );
  }

  return (
    <span
      className="game-post-tag-pill glass flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-text-muted hover:bg-white/10 hover:text-text"
      style={{ animationDelay: delay }}
    >
      {label}
      {count !== undefined && <span className="font-bold text-text">{count}</span>}
    </span>
  );
}
