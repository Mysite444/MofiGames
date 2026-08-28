import { Fragment } from "react";
import { categories } from "@/lib/categories";
import {
  getFeaturedGamesMerged,
  getTrendingGamesMerged,
  getNewGamesMerged,
  getEditorsPicksMerged,
  getSponsoredGamesMerged,
  getOriginalsMerged,
  getLeaderboardMerged,
} from "@/lib/curated-games";
import { FeaturedBanner } from "./FeaturedBanner";
import { GameCard } from "./GameCard";
import { MobileGameRow } from "./MobileGameRow";
import { ContinuePlayingMobile } from "./ContinuePlayingSection";
import { LeaderboardPanel } from "./LeaderboardPanel";
import { BackToTopButton } from "./BackToTopButton";
import type { Category, Game, IconName } from "@/lib/types";

// Categories already given their own named section below — the rest render
// as plain genre rows further down so all of them are reachable from the home page.
const FEATURED_CATEGORY_SLUGS = new Set(["sports", "multiplayer", "brain", "driving"]);

// Hardcoded slugs for the 18 built-in genres (matches categories.ts)
const STATIC_SLUGS = new Set(categories.map((c) => c.slug));

function NewGamesBlock({
  scroll,
  banner,
  grid,
}: {
  scroll: Game[];
  banner: Game | undefined;
  grid: Game[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <MobileGameRow
        title="New Games"
        icon="Sparkles"
        accent="#ffd60a"
        games={scroll}
        viewMoreHref="/leaderboard"
        cardSize="portrait"
        headerBg="gold"
      />
      {banner && (
        <div className="flex flex-col gap-3">
          <div className="px-4">
            <FeaturedBanner game={banner} />
          </div>
          <div className="grid grid-cols-3 gap-2.5 px-4">
            {grid.map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function MobileHome({
  realGames = [],
  realCategories = [],
  country = null,
}: {
  /** Games added through the admin panel (published, real database rows). */
  realGames?: Game[];
  /**
   * ALL real categories from the DB — including any that overlap with the
   * 18 built-in genre slugs. The component splits these internally:
   * - builtInOverrides: DB rows for the 18 built-in genres (name / icon /
   *   colorFrom / displayStyle may differ from the hardcoded defaults)
   * - visibleRealCategories: DB rows for admin-created categories (slugs
   *   NOT in the static set) — rendered as additional genre rows at the bottom
   */
  realCategories?: Category[];
  /** Visitor's country, already resolved to a display name (e.g. "Pakistan")
   * — same contract as TopPicksRow's country prop, see there for details. */
  country?: string | null;
}) {
  // DB overrides for the 18 built-in genres — keyed by slug.
  // When an admin edits a built-in genre's name / icon / color / display_style
  // in Admin → Categories, those values take effect here.
  const builtInOverrides = new Map(
    realCategories
      .filter((c) => STATIC_SLUGS.has(c.slug))
      .map((c) => [c.slug, c])
  );

  // Admin-created categories (slugs not in the 18 built-in set) — same
  // filter/sort/label logic as before.
  const visibleRealCategories = realCategories
    .filter((c) => !STATIC_SLUGS.has(c.slug) && c.showOnHomepage !== false)
    .sort((a, b) => (a.homepagePosition ?? Infinity) - (b.homepagePosition ?? Infinity));

  function gamesForCategory(slug: string): Game[] {
    return realGames.filter((g) => g.categorySlug === slug);
  }

  // Helper: resolve name/icon/accent/cardSize for a built-in genre slug,
  // using the DB override when it exists and falling back to categories.ts.
  function genreProps(slug: string, hardcodedCat: Category) {
    const db = builtInOverrides.get(slug);
    return {
      title: db?.name ?? hardcodedCat.name,
      icon: (db?.icon ?? hardcodedCat.icon) as IconName,
      accent: db?.colorFrom ?? hardcodedCat.colorFrom,
      cardSize: db?.displayStyle === "portrait" ? ("portrait" as const) : undefined,
    };
  }

  // Top Picks for You: 4 repeated banner+grid blocks
  const featuredAll = getFeaturedGamesMerged(realGames);
  const topPicksBanners = featuredAll.slice(0, 4);
  const topPicksGridPool = getTrendingGamesMerged(realGames, 24);
  const topPicksGrids = [
    topPicksGridPool.slice(0, 6),
    topPicksGridPool.slice(6, 12),
    topPicksGridPool.slice(12, 18),
    topPicksGridPool.slice(18, 24),
  ];

  const featured = featuredAll;

  const newGamesAll = getNewGamesMerged(realGames, 20);
  const newGamesScroll = newGamesAll.slice(0, 8);
  const newGamesBanner = newGamesAll[8];
  const newGamesGrid = newGamesAll.slice(9, 15);

  const originals = getOriginalsMerged(realGames);
  const sports = gamesForCategory("sports");
  const cantStop = getTrendingGamesMerged(realGames, 10);
  const friends = gamesForCategory("multiplayer");
  const brain = gamesForCategory("brain");
  const leaderboardGames = getLeaderboardMerged(realGames, 10);
  const editorsPicks = getEditorsPicksMerged(realGames);
  const sponsored = getSponsoredGamesMerged(realGames);
  const driving = gamesForCategory("driving");

  // Find the hardcoded Category objects for the 4 featured genres
  const sportsCat = categories.find((c) => c.slug === "sports")!;
  const multiCat = categories.find((c) => c.slug === "multiplayer")!;
  const brainCat = categories.find((c) => c.slug === "brain")!;
  const drivingCat = categories.find((c) => c.slug === "driving")!;

  const remainingCategories = categories.filter((c) => !FEATURED_CATEGORY_SLUGS.has(c.slug));

  return (
    <div className="flex flex-col gap-5 pb-2">
      <ContinuePlayingMobile />

      {realGames.length > 0 && (
        <MobileGameRow
          title="Your Games"
          icon="Sparkles"
          accent="#FFD60A"
          games={realGames}
          viewMoreHref="/leaderboard"
          cardSize="portrait"
          headerBg="gold"
        />
      )}

      {topPicksBanners.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-category-fat px-4 text-[17px] text-white">
            {country ? `Today's Best in ${country}` : "Today's Best"}
          </h2>
          {topPicksBanners.map((banner, i) => (
            <div key={banner.id} className="flex flex-col gap-3">
              <div className="px-4">
                <FeaturedBanner game={banner} />
              </div>
              <div className="grid grid-cols-3 gap-2 px-4">
                {topPicksGrids[i]?.map((g) => (
                  <GameCard key={g.id} game={g} />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      <MobileGameRow
        title="Featured Games"
        icon="Sparkles"
        accent="#ffffff"
        games={featured}
        viewMoreHref="/leaderboard"
        cardSize="portrait"
      />

      <MobileGameRow
        title="Sponsored"
        icon="Zap"
        accent="#FACC15"
        games={sponsored}
        viewMoreHref="/leaderboard"
      />

      <MobileGameRow
        title="MofiGames Originals"
        icon="Home"
        accent="#3da9fc"
        games={originals}
        viewMoreHref="/leaderboard"
        cardSize="portrait"
        headerBg="blue"
      />

      {/* ── 4 featured genres — use DB overrides if admin changed name/icon/color ── */}
      {(() => {
        const p = genreProps("sports", sportsCat);
        return (
          <MobileGameRow
            title={p.title}
            icon={p.icon}
            accent={p.accent}
            games={sports}
            viewMoreHref="/sports"
            cardSize={p.cardSize}
          />
        );
      })()}

      <MobileGameRow
        title="Can't Stop Playing"
        icon="Flame"
        accent="#ffffff"
        games={cantStop}
        viewMoreHref="/leaderboard"
      />

      {(() => {
        const p = genreProps("multiplayer", multiCat);
        return (
          <MobileGameRow
            title={p.title}
            icon={p.icon}
            accent={p.accent}
            games={friends}
            viewMoreHref="/multiplayer"
            cardSize={p.cardSize}
          />
        );
      })()}

      {(() => {
        const p = genreProps("brain", brainCat);
        return (
          <MobileGameRow
            title={p.title}
            icon={p.icon}
            accent={p.accent}
            games={brain}
            viewMoreHref="/brain"
            cardSize={p.cardSize}
          />
        );
      })()}

      <LeaderboardPanel games={leaderboardGames} />

      <MobileGameRow
        title="Editor's Picks"
        icon="Sparkles"
        accent="#ffffff"
        games={editorsPicks}
        viewMoreHref="/leaderboard"
      />

      {(() => {
        const p = genreProps("driving", drivingCat);
        return (
          <MobileGameRow
            title={p.title}
            icon={p.icon}
            accent={p.accent}
            games={driving}
            viewMoreHref="/driving"
            cardSize={p.cardSize}
          />
        );
      })()}

      {/* ── Remaining 14 built-in genres — use DB overrides for name/icon/color/style ── */}
      {remainingCategories.map((cat) => {
        const p = genreProps(cat.slug, cat);
        return (
          <Fragment key={cat.slug}>
            {cat.slug === "simulation" && (
              <NewGamesBlock scroll={newGamesScroll} banner={newGamesBanner} grid={newGamesGrid} />
            )}
            <MobileGameRow
              title={p.title}
              icon={p.icon}
              accent={p.accent}
              games={gamesForCategory(cat.slug)}
              viewMoreHref={`/${cat.slug}`}
              cardSize={p.cardSize}
            />
          </Fragment>
        );
      })}

      {/* ── Admin-created categories (beyond the 18 built-ins) ── */}
      {visibleRealCategories.map((cat) => (
        <MobileGameRow
          key={cat.slug}
          title={cat.homepageLabel ?? cat.name}
          icon={cat.icon}
          accent={cat.colorFrom}
          games={realGames.filter((g) => g.categorySlug === cat.slug)}
          viewMoreHref={`/${cat.slug}`}
          cardSize={cat.displayStyle === "portrait" ? "portrait" : undefined}
        />
      ))}

      <BackToTopButton />
    </div>
  );
}
