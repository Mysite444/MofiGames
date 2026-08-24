import { CategoryRow } from "@/components/CategoryRow";
import { MobileHome } from "@/components/MobileHome";
import { TopPicksRow } from "@/components/TopPicksRow";
import { LeaderboardPanel } from "@/components/LeaderboardPanel";
import { RandomGameButton } from "@/components/RandomGameButton";
import { ContinuePlayingDesktop } from "@/components/ContinuePlayingSection";
import { ArrowUp } from "lucide-react";
import { categories } from "@/lib/categories";
import {
  getFeaturedGamesMerged,
  getTrendingGamesMerged,
  getNewGamesMerged,
  getUpdatedGamesMerged,
  getEditorsPicksMerged,
  getSponsoredGamesMerged,
  getOriginalsMerged,
  getLeaderboardMerged,
} from "@/lib/curated-games";
import { getAllRealGames, getAllRealCategories } from "@/lib/games-server";
import { getOrSetFragment } from "@/lib/fragment-cache";
import {
  getHomepageSectionOverrides,
  getHomepageSectionPinnedGameIds,
} from "@/lib/homepage-layout-server";
import { ALL_REGISTRY_SECTIONS, categorySectionKey } from "@/lib/homepage-section-registry";
import { getSeoSettings } from "@/lib/seo-settings";
import { getSiteIdentity } from "@/lib/site-identity";
import { applyTitleTemplate } from "@/lib/seo";
import { clientCountryFromHeaders, countryNameFromCode } from "@/lib/request-ip";
import { timed } from "@/lib/perf-instrumentation";
import type { Game } from "@/lib/types";
import type { Metadata } from "next";

// Home Page SEO (Advanced SEO Module) — title/description/OG override from
// Admin → SEO Management → Global Settings; Organization/WebSite JSON-LD
// for the whole site already renders once, site-wide, from the root
// layout (src/app/layout.tsx), so it isn't repeated here.
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSeoSettings();
  const title =
    settings.homeSeoTitle?.trim() ||
    applyTitleTemplate(settings.titleTemplate, { title: "Free Online Games", site_name: settings.siteName });
  const description = settings.homeMetaDescription?.trim() || settings.defaultMetaDescription;
  const image = settings.homeOgImageUrl || settings.defaultOgImageUrl;

  return {
    title,
    description,
    alternates: { canonical: "/" },
    openGraph: { title, description, url: "/", images: image ? [image] : undefined },
    twitter: { card: settings.twitterCardType, title, description, images: image ? [image] : undefined },
  };
}

// One row in the homepage's admin-configurable layout — see
// src/components/admin/HomepageCategoriesManager.tsx ("Homepage → Categories")
// where an admin edits the heading, order, visibility, and pinned games
// behind every one of these.
interface HomeRow {
  key: string;
  label: string;
  games: Game[];
  href?: string;
  variant?: "default" | "originals";
  anchorId?: string;
  position: number;
}

// Categories without an explicit homepage position sink to the very
// bottom, same as before this admin layout system existed.
const UNPOSITIONED_CATEGORY_SENTINEL = 100_000;

// LeaderboardPanel isn't a reorderable row (it's a widget, not a
// heading+games category) so it stays anchored between whatever ends up
// with position < 75 vs >= 75 — the gap between "Brain Games" (70) and
// "Editor's Picks" (80) by default, exactly where it renders today.
const LEADERBOARD_ANCHOR_POSITION = 75;

export default async function HomePage() {
  const __homepageStart = process.env.PERF_DEBUG_TTFB === "1" ? performance.now() : 0;
  // Real (database) games/categories, added through the admin panel.
  //
  // These six reads are independent of one another — none of them consumes
  // another's result — so they're fired concurrently instead of one at a
  // time. Previously this was six sequential `await`s, each paying its own
  // full Supabase round trip back-to-back; on this project's Vercel↔Supabase
  // path that was the single largest contributor to homepage TTFB (see
  // MOFIGAMES_PERFORMANCE_AUDIT.md, Step 4/12). Promise.all is safe here
  // specifically because every one of these functions already resolves
  // internally (games-server.ts / site-identity.ts / homepage-layout-server.ts
  // each catch their own Supabase errors and fall back to static data) — the
  // only thing that can still reject is a Next.js control-flow signal
  // (redirect/notFound/DYNAMIC_SERVER_USAGE), which Promise.all propagates
  // immediately, same as a sequential await chain would have.
  const [realGames, realCategories, identity, countryCode, sectionOverrides, pinnedGameIds] = await timed(
    "homepage:batch1(games+categories+identity+country+sections+pinned)",
    () =>
      Promise.all([
        getAllRealGames(),
        getAllRealCategories(),
        getSiteIdentity(),
        clientCountryFromHeaders(),
        getHomepageSectionOverrides(),
        getHomepageSectionPinnedGameIds(),
      ])
  );
  const topPicksCountry = countryNameFromCode(countryCode);
  const realGamesById = new Map(realGames.map((g) => [g.id, g]));

  function pinnedGamesFor(key: string): Game[] {
    const ids = pinnedGameIds.get(key) ?? [];
    return ids.map((id) => realGamesById.get(id)).filter((g): g is Game => Boolean(g));
  }

  // Manually pinned games are additive — they show up first, on top of
  // whatever a row already displays automatically, deduped by id so a
  // game pinned to its own natural category doesn't appear twice.
  function withPins(key: string, automatic: Game[]): Game[] {
    const pinned = pinnedGamesFor(key);
    if (pinned.length === 0) return automatic;
    const seen = new Set(pinned.map((g) => g.id));
    return [...pinned, ...automatic.filter((g) => !seen.has(g.id))];
  }

  function gamesForCategory(slug: string): Game[] {
    return realGames.filter((g) => g.categorySlug === slug);
  }

  const staticSlugs = new Set(categories.map((c) => c.slug));
  // All real DB categories whose slug doesn't clash with a static placeholder.
  const newRealCategories = realCategories.filter((c) => !staticSlugs.has(c.slug));
  // DB overrides for the 18 built-in genres — keyed by slug.
  // After migration 0066 the admin can change name / icon / colorFrom /
  // display_style for any built-in genre; this map surfaces those edits in
  // the homepage row rendering without removing any hardcoded fallback.
  const builtInOverrides = new Map(
    realCategories.filter((c) => staticSlugs.has(c.slug)).map((c) => [c.slug, c])
  );

  // "featured-games" and "trending-games" are fragment-cached in their
  // own right (Admin → Cache → Fragment Cache), separately from the
  // "game-cards" dataset both derive from — an admin who only wants a
  // shorter TTL on the volatile Trending rail, without touching the
  // rest of the games dataset's cache lifetime, can do that here.
  // Both depend on realGames (just resolved above) but not on each other,
  // so they run concurrently rather than one after the other.
  const [featured, trending] = await timed("homepage:batch2(featured+trending)", () =>
    Promise.all([
      getOrSetFragment("featured-games", undefined, async () => getFeaturedGamesMerged(realGames)),
      getOrSetFragment("trending-games", undefined, async () => getTrendingGamesMerged(realGames)),
    ])
  );
  const fresh = getNewGamesMerged(realGames);
  const updated = getUpdatedGamesMerged(realGames);
  const originals = getOriginalsMerged(realGames, 19);
  const editorsPicks = getEditorsPicksMerged(realGames);
  const sponsored = getSponsoredGamesMerged(realGames);
  const leaderboardGames = getLeaderboardMerged(realGames, 12);

  // Top Picks for You: repeating [1 big banner + 4 small] units — one unit
  // per featured category, each paired with its own slice of trending games.
  const topPicksBanners = featured;
  const topPicksPool = getTrendingGamesMerged(realGames, topPicksBanners.length * 4);
  const topPicksGrids = topPicksBanners.map((_, i) => topPicksPool.slice(i * 4, i * 4 + 4));

  function automaticGamesForRegistryKey(key: string): Game[] {
    switch (key) {
      case "system:featured":
        return featured;
      case "system:sponsored":
        return sponsored;
      case "system:new":
        return fresh;
      case "system:originals":
        return originals;
      case "system:trending":
        return trending;
      case "system:editors_pick":
        return editorsPicks;
      case "system:updated":
        return updated;
      default:
        return key.startsWith("genre:") ? gamesForCategory(key.slice("genre:".length)) : [];
    }
  }

  // The 7 system-curated rows + 18 built-in genre rows, with admin
  // overrides (heading/order/visibility) and manually pinned games applied.
  const registryRows: HomeRow[] = ALL_REGISTRY_SECTIONS.map((def): HomeRow | null => {
    const override = sectionOverrides.get(def.key);
    const isVisible = override?.isVisible ?? true;
    if (!isVisible) return null;

    // For genre rows, check if the admin changed the name in Admin → Categories.
    // Priority: homepage_sections label (set in HomepageCategoriesManager)
    //           > categories.name  (set in Admin → Categories form)
    //           > hardcoded default from categories.ts / section registry
    let label = override?.label?.trim() || def.defaultLabel;
    let variant = def.variant;

    if (def.type === "genre") {
      const slug = def.key.slice("genre:".length);
      const dbCat = builtInOverrides.get(slug);
      if (dbCat) {
        // Use the DB category name as a secondary fallback (after the
        // homepage_sections label but before the hardcoded defaultLabel).
        if (!override?.label?.trim() && dbCat.name && dbCat.name !== def.defaultLabel) {
          label = dbCat.name;
        }
        // Map display_style → CategoryRow variant
        if (dbCat.displayStyle === "portrait") variant = "originals";
        else variant = undefined; // 'default' explicitly clears any registry default
      }
    }

    const games = withPins(def.key, automaticGamesForRegistryKey(def.key));
    return {
      key: def.key,
      label,
      games,
      href: def.href,
      variant,
      anchorId: def.anchorId,
      position: override?.position ?? def.defaultPosition,
    };
  }).filter((row): row is HomeRow => row !== null);

  // Real DB categories — every one of them now shares the same global
  // position number-space as the rows above (see Admin → Categories →
  // Homepage Placement, and Admin → Homepage → Categories).
  const categoryRows: HomeRow[] = newRealCategories
    .filter((cat) => cat.showOnHomepage !== false)
    .map((cat) => {
      const key = categorySectionKey(cat.slug);
      const automatic = realGames.filter((g) => g.categorySlug === cat.slug);
      return {
        key,
        label: cat.homepageLabel ?? cat.name,
        games: withPins(key, automatic),
        href: `/${cat.slug}`,
        position: cat.homepagePosition ?? UNPOSITIONED_CATEGORY_SENTINEL,
        // Map the admin-chosen display template to CategoryRow's variant prop
        variant: cat.displayStyle === "portrait" ? ("originals" as const) : undefined,
      };
    });

  const allRows = [...registryRows, ...categoryRows].sort(
    (a, b) => a.position - b.position || a.key.localeCompare(b.key)
  );

  const leaderboardSplit = allRows.findIndex((r) => r.position >= LEADERBOARD_ANCHOR_POSITION);
  const rowsBeforeLeaderboard = leaderboardSplit === -1 ? allRows : allRows.slice(0, leaderboardSplit);
  const rowsAfterLeaderboard = leaderboardSplit === -1 ? [] : allRows.slice(leaderboardSplit);

  function renderRow(row: HomeRow) {
    if (row.anchorId) {
      return (
        <div id={row.anchorId} key={row.key}>
          <CategoryRow title={row.label} games={row.games} href={row.href} variant={row.variant} />
        </div>
      );
    }
    return (
      <CategoryRow key={row.key} title={row.label} games={row.games} href={row.href} variant={row.variant} />
    );
  }

  if (process.env.PERF_DEBUG_TTFB === "1") {
    console.log(`[perf] homepage:total data-ready: ${(performance.now() - __homepageStart).toFixed(1)}ms`);
  }

  return (
    <>
      {/* Mobile / iOS / Android — untouched */}
      <div className="lg:hidden">
        <MobileHome realGames={realGames} realCategories={realCategories} country={topPicksCountry} />
      </div>

      {/* Desktop / laptop — full redesign following the reference screenshots */}
      <div className="hidden flex-col gap-2 lg:flex">
        <ContinuePlayingDesktop />

        {realGames.length > 0 && <CategoryRow title="Your Games" games={realGames} />}

        <TopPicksRow banners={topPicksBanners} grids={topPicksGrids} country={topPicksCountry} />

        {rowsBeforeLeaderboard.map(renderRow)}

        <LeaderboardPanel games={leaderboardGames} />

        {rowsAfterLeaderboard.map(renderRow)}

        <div className="flex justify-center gap-3 px-4 md:px-6">
          <RandomGameButton />
          <a
            href="#top"
            className="btn-cta inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm"
          >
            <ArrowUp size={18} strokeWidth={2.5} />
            Back to Top
          </a>
        </div>

        <footer className="mt-4 border-t border-white/10 px-4 py-8 text-center text-xs text-text-faint md:px-6">
          © {new Date().getFullYear()} {identity.copyrightText}
        </footer>
      </div>
    </>
  );
}
