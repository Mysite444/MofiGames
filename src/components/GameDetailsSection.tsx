"use client";

import Link from "next/link";
import { Share2, ChevronRight, Bookmark } from "lucide-react";
import { getGameMeta } from "@/lib/gameMeta";
import { useGamesByCategory } from "@/lib/games-merged";
import { getControlsList } from "@/lib/game-controls";
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
  const controlsList = getControlsList(game);

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
      <nav className="flex flex-wrap items-center gap-1 text-xs text-text-faint">
        <Link href="/" className="hover:text-text">Games</Link>
        <ChevronRight size={12} />
        <Link href={`/${category.slug}`} className="hover:text-text">{category.name}</Link>
        <ChevronRight size={12} />
        <span className="text-text-muted">{game.title}</span>
      </nav>

      <div className="flex flex-col gap-3">
        <h1 className="font-display text-2xl font-bold text-text sm:text-3xl">{game.title}</h1>
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
      </div>

      {isRealGame ? (
        <RatingStars slug={game.slug} rating={game.rating} ratingCount={game.ratingCount ?? 0} />
      ) : (
        <p className="text-sm text-text-muted">
          <span className="font-bold text-text">{meta.ratingOutOf10}</span>{" "}
          <span className="text-text-muted">({meta.votes.toLocaleString()} votes)</span>
        </p>
      )}

      <div className="flex items-start justify-between gap-6">
        <dl className="flex flex-1 flex-col gap-2 text-sm">
          <StatRow label="Released">{releasedLabel}</StatRow>
          {isRealGame ? (
            <>
              {game.developer && <StatRow label="Developer">{game.developer}</StatRow>}
              {game.publisher && <StatRow label="Publisher">{game.publisher}</StatRow>}
              {game.version && <StatRow label="Version">{game.version}</StatRow>}
            </>
          ) : (
            <>
              <StatRow label="Last Updated">{meta.lastUpdatedLabel}</StatRow>
              <StatRow label="Game engine">{meta.gameEngine}</StatRow>
            </>
          )}
          <StatRow label="Platform">
            {game.mobileSupport === false ? "Desktop only" : "Browser (desktop & mobile)"}
          </StatRow>
          <StatRow label="Orientation">{orientationLabel}</StatRow>
        </dl>

        <GamePostAdSlot
          config={customHtmlAds ?? { enabled: false, slotId: null, code: null }}
          adsenseClientId={adsenseClientId}
          adsenseReady={adsenseReady}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {game.tag && (
          <span className="flex items-center rounded-full bg-hot/15 px-3.5 py-1.5 text-xs font-bold text-hot">
            {game.tag}
          </span>
        )}
        <TagPill label={category.name} count={70} />
        {game.multiplayer ? (
          <TagPill label="Multiplayer" count={multiplayerCount} />
        ) : (
          <TagPill label="Singleplayer" />
        )}
        <TagPill label="Browser" />
      </div>

      <p className="text-sm leading-relaxed text-text-muted">
        {game.description && game.description.trim().length > 0 ? (
          game.description
        ) : (
          <>
            Jump into {game.title}, a {category.name.toLowerCase()} pick from MofiGames. {category.description} No
            download, no install — it runs straight in your browser on desktop, tablet, or phone.
          </>
        )}
      </p>

      {/* Long-form arranged content — How to Play / Tips / Features / FAQ,
          authored in the admin's "Content" field (RichTextEditor). Renders
          real headings/paragraphs/lists instead of a flat paragraph;
          renders nothing for games that don't have it authored yet. */}
      <GameContentSection html={game.content} />

      {game.instructions && game.instructions.trim().length > 0 && (
        <div>
          <h2 className="mb-1 font-display text-base font-bold text-text">How to play</h2>
          <p className="text-sm leading-relaxed text-text-muted">{game.instructions}</p>
        </div>
      )}

      {!isRealGame && (
        <div>
          <h2 className="mb-1 font-display text-base font-bold text-text">Last Updated</h2>
          <p className="text-sm text-text-muted">{meta.lastUpdatedFullDate}</p>
        </div>
      )}

      <div>
        <h2 className="mb-2 font-display text-base font-bold text-text">Controls</h2>
        <ul className="flex flex-col gap-1.5 text-sm text-text-muted">
          {controlsList.map((c) => (
            <li key={c} className="flex items-start gap-2">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-text-faint" />
              {c}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function StatRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <dt className="w-32 shrink-0 text-text-faint">{label}:</dt>
      <dd className="font-semibold text-text">{children}</dd>
    </div>
  );
}

function TagPill({ label, count }: { label: string; count?: number }) {
  return (
    <span className="glass flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-text-muted">
      {label}
      {count !== undefined && <span className="font-bold text-text">{count}</span>}
    </span>
  );
}
