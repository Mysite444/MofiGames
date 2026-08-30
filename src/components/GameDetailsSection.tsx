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
   * powers the in-post ad slot at the top-right of the info card below. */
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

  // ── Game Info rows ────────────────────────────────────────────────────────
  // Built as an array (rather than hand-tracked indices) so the CrazyGames-
  // style field order — Developer, Rating, Released, Game engine, Platform,
  // Orientation — stays intact regardless of which optional admin-entered
  // facts (Publisher / Version) are present, and the stagger animation on
  // each StatRow lines up with whatever actually renders.
  const infoRows: { label: string; value: React.ReactNode }[] = [];

  if (isRealGame && game.developer) {
    infoRows.push({ label: "Developer", value: game.developer });
  }
  if (isRealGame && game.publisher) {
    infoRows.push({ label: "Publisher", value: game.publisher });
  }
  infoRows.push({
    label: "Rating",
    value: (
      <>
        {meta.ratingOutOf10}{" "}
        <span className="font-normal text-text-faint">
          ({(game.ratingCount ?? meta.votes).toLocaleString()} votes)
        </span>
      </>
    ),
  });
  infoRows.push({ label: "Released", value: releasedLabel });
  if (isRealGame && game.version) {
    infoRows.push({ label: "Version", value: game.version });
  }
  infoRows.push({ label: "Game engine", value: meta.gameEngine });
  infoRows.push({
    label: "Platform",
    value: game.mobileSupport === false ? "Desktop only" : "Browser (desktop & mobile)",
  });
  infoRows.push({ label: "Orientation", value: orientationLabel });

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
          Card 1 — Header (breadcrumb · title · share · rating + top-right
          ad) · Game Info · Tags
          Mirrors the CrazyGames game-post panel exactly: breadcrumb, title,
          share button and rating now live inside the top of this card
          rather than floating above it, with the in-post 300×250 ad sitting
          at the top right of that same header row. Rectangular (rounded-lg)
          panel + rectangular tag chips, matching the reference layout.
          Three sections separated by hairlines:
            1. Header  (breadcrumb, title, share, rating — left)
                        + Ad slot  (Admin → Monetization → Custom HTML Ads — right)
            2. Game Info  (Developer, Rating, Released, Engine, Platform …)
            3. Tags  (category, multiplayer, browser …)
          Uses .game-post-card-1's animation (fastest-in) since this panel
          is the first thing to appear below the player.
          ══════════════════════════════════════════════════════════════ */}
      <div className="game-post-card-1 glass flex flex-col overflow-hidden rounded-lg">

        {/* ── Section 1: Header (left) + ad slot (top right) ─────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-6 border-b border-white/[0.06] px-5 py-4">
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
            {infoRows.map((row, index) => (
              <StatRow key={row.label} label={row.label} index={index}>
                {row.value}
              </StatRow>
            ))}
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
          Controls intentionally aren't repeated here — they live in the
          "Game controls" popover on the play screen (PlayerActionBar).
          Now sits below the info/tags card, using .game-post-card-2's
          animation (slightly delayed) so the two panels still cascade in
          the order they appear on screen.
          ══════════════════════════════════════════════════════════════ */}
      <div className="game-post-card-2 glass flex flex-col gap-4 rounded-lg p-5">
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
 * A key-value row inside Card 1's "Game Info" section.
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
 * A rectangular tag chip inside Card 1's "Tags" section, matching the
 * CrazyGames reference: a label on the left and — when a count is given —
 * a distinct, slightly lighter rectangular badge fused to its right edge,
 * both inside one rounded-md (not fully pill-shaped) container.
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
  const isHot = variant === "hot";

  return (
    <span
      className={
        "game-post-tag-pill flex items-stretch overflow-hidden rounded-md text-xs font-semibold " +
        (isHot
          ? "bg-hot/15 text-hot hover:bg-hot/25"
          : "glass text-text-muted hover:bg-white/10 hover:text-text")
      }
      style={{ animationDelay: delay }}
    >
      <span className="flex items-center px-3 py-1.5">{label}</span>
      {count !== undefined && (
        <span
          className={
            "flex items-center px-2.5 py-1.5 font-bold " +
            (isHot ? "bg-hot/20 text-hot" : "bg-white/10 text-text")
          }
        >
          {count.toLocaleString()}
        </span>
      )}
    </span>
  );
}
