import { notFound } from "next/navigation";
import { cache } from "react";
import type { Metadata } from "next";
import { FileText, Tag as TagIcon } from "lucide-react";
import Link from "next/link";

// ─── Server data ──────────────────────────────────────────────────────────────
import {
  getRealGameBySlug,
  getRealGamesByCategory,
  getPublishedGameSlugsForStaticParams,
  getAllRealCategoriesForStaticParams,
  getAllRealGames,
  getAllRealCategories,
  isCurrentUserAdmin,
} from "@/lib/games-server";
import { categories, getCategoryBySlug } from "@/lib/categories";
import { getTagBySlug, getPostsByTag, getPageBySlug } from "@/lib/content-server";
import { getSeoSettings } from "@/lib/seo-settings";

// ─── SEO ──────────────────────────────────────────────────────────────────────
import {
  buildGameMetadata,
  buildCategoryMetadata,
  buildPageMetadata,
  videoGameSchema,
  softwareApplicationSchema,
  collectionPageSchema,
  breadcrumbSchema,
  applyTitleTemplate,
  buildRobotsMeta,
  absoluteUrl,
} from "@/lib/seo";

// ─── Game components ──────────────────────────────────────────────────────────
import { GamePlayerPanel } from "@/components/GamePlayerPanel";
import { HorizontalAdSlot } from "@/components/HorizontalAdSlot";
import { GameDetailsSection } from "@/components/GameDetailsSection";
import { CommentsSection } from "@/components/CommentsSection";
import { ReviewsSection } from "@/components/ReviewsSection";
import { DesktopBackToGameButton } from "@/components/DesktopBackToGameButton";
import { MobileGamePage } from "@/components/MobileGamePage";
import { SidebarAdSlot } from "@/components/SidebarAdSlot";
import { SidebarPlayNextGrid } from "@/components/SidebarPlayNextGrid";
import { getAdSettings } from "@/lib/ad-settings";

// ─── Category components ──────────────────────────────────────────────────────
import { iconMap } from "@/lib/icon-map";
import { FeaturedBanner } from "@/components/FeaturedBanner";
import { CategoryGrid } from "@/components/CategoryGrid";
import { CategoryPageHeading } from "@/components/CategoryPageHeading";
import { CategoryDesktopGrid } from "@/components/CategoryDesktopGrid";
import { CategoryContentSection } from "@/components/CategoryContentSection";
import { categoryHeadingTitle } from "@/lib/category-heading";

// ─── Shared components ────────────────────────────────────────────────────────
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { StaticPage } from "@/components/StaticPage";
import { RichContent } from "@/components/RichContent";
import { JsonLd } from "@/components/JsonLd";
import type { Game, Category } from "@/lib/types";

// ---------------------------------------------------------------------------
// GAME FRAME CONSTANTS (ported from /game/[slug]/page.tsx)
// CrazyGames' own developer docs (docs.crazygames.com/requirements/gameplay)
// list the exact iframe sizes their site renders games at. Every listed
// "desktop non-fullscreen" size is 16:9, and the largest is 1216×684.
// ---------------------------------------------------------------------------
const GAME_FRAME_ORIGINAL_WIDTH_PX = 1216;
const INCH_PX = 96;
const CM_PX = INCH_PX / 2.54;
const GAME_FRAME_WIDEN_PX = 1 * INCH_PX;
const GAME_FRAME_NARROW_PER_SIDE_PX = 0.6 * INCH_PX;
const GAME_FRAME_WIDEN_BACK_PER_SIDE_PX = 0.35 * INCH_PX;
const GAME_FRAME_NARROW2_PER_SIDE_PX = 1 * CM_PX;
const GAME_FRAME_INSET_PER_SIDE_PX =
  GAME_FRAME_NARROW_PER_SIDE_PX - GAME_FRAME_WIDEN_BACK_PER_SIDE_PX + GAME_FRAME_NARROW2_PER_SIDE_PX;
const GAME_FRAME_INSET_TOTAL_PX = GAME_FRAME_INSET_PER_SIDE_PX * 2;
const GAME_FRAME_MAX_WIDTH_PX =
  GAME_FRAME_ORIGINAL_WIDTH_PX + GAME_FRAME_WIDEN_PX - GAME_FRAME_INSET_TOTAL_PX;
const RESERVED_VERTICAL_SPACE_PX = 210;
const GAME_FRAME_HEIGHT = `min(${(GAME_FRAME_ORIGINAL_WIDTH_PX * 9) / 16}px, calc(100vh - ${RESERVED_VERTICAL_SPACE_PX}px))`;
const GAME_FRAME_WIDTH = `calc(100% - ${GAME_FRAME_INSET_TOTAL_PX}px)`;
const GAME_FRAME_MAX_WIDTH = `${GAME_FRAME_MAX_WIDTH_PX}px`;

// ---------------------------------------------------------------------------
// Slug resolver — React cache() deduplicates the DB call so generateMetadata
// and the page component share one fetch per request, never two.
//
// Resolution priority:
//   1. Game   — primary content type on a gaming site
//   2. Category — major content grouping
//   3. Tag    — blog/post organisation
//   4. CMS page — admin-created static pages
//   5. → 404
// ---------------------------------------------------------------------------
type SlugResolution =
  | { type: "game"; slug: string }
  | { type: "category"; slug: string }
  | { type: "tag"; slug: string }
  | { type: "page"; slug: string }
  | { type: "not-found" };

const resolveSlug = cache(async (slug: string): Promise<SlugResolution> => {
  // 1. Game
  const realGame = await getRealGameBySlug(slug);
  if (realGame) return { type: "game", slug };

  // 2. Category — check built-in catalogue first, then DB rows
  const builtIn = getCategoryBySlug(slug);
  if (builtIn) return { type: "category", slug };
  const realCategories = await getAllRealCategories();
  if (realCategories.some((c) => c.slug === slug)) return { type: "category", slug };

  // 3. Tag
  const tag = await getTagBySlug(slug);
  if (tag) return { type: "tag", slug };

  // 4. CMS page
  const page = await getPageBySlug(slug);
  if (page) return { type: "page", slug };

  return { type: "not-found" };
});

// ---------------------------------------------------------------------------
// Static params — pre-render all published games + all known categories.
// Tags and CMS pages are SSR-on-demand (dynamicParams = true by default).
// ---------------------------------------------------------------------------
export async function generateStaticParams() {
  // getAllRealCategoriesForStaticParams() is the build-time-safe twin of
  // getAllRealCategories(). It uses a plain anon-key Supabase client with no
  // cookies() dependency, which is required here because generateStaticParams
  // runs at build time with no HTTP request context. Using getAllRealCategories()
  // here would trigger cookies() → "Route /[slug] used cookies() inside
  // generateStaticParams" error (see games-server.ts for the full call chain).
  // At runtime, every other call site still uses the fragment-cached
  // getAllRealCategories() — this function is only for this static-params step.
  const [gameSlugs, realCategories] = await Promise.all([
    getPublishedGameSlugsForStaticParams(),
    getAllRealCategoriesForStaticParams(),
  ]);

  const builtInCategorySlugs = categories.map((c) => c.slug);
  const realCategorySlugs = realCategories.map((c) => c.slug);
  const allCategorySlugs = [...new Set([...builtInCategorySlugs, ...realCategorySlugs])];

  const allSlugs = [...new Set([...gameSlugs, ...allCategorySlugs])];
  return allSlugs.map((slug) => ({ slug }));
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const resolution = await resolveSlug(slug);
  const settings = await getSeoSettings();

  if (resolution.type === "game") {
    const real = await getRealGameBySlug(slug);
    if (!real) return {};
    return buildGameMetadata(real.game, real.category, settings);
  }

  if (resolution.type === "category") {
    const realCategories = await getAllRealCategories();
    const category = getCategoryBySlug(slug) ?? realCategories.find((c) => c.slug === slug);
    if (!category) return {};
    return buildCategoryMetadata(category, settings);
  }

  if (resolution.type === "tag") {
    const tag = await getTagBySlug(slug);
    if (!tag) return {};
    const title =
      tag.seoTitle?.trim() ||
      applyTitleTemplate(settings.titleTemplate, {
        title: `${tag.name} Games & Posts`,
        site_name: settings.siteName,
      });
    const description =
      tag.seoDescription?.trim() ||
      `Posts and updates tagged "${tag.name}" on ${settings.siteName}.`;
    const canonical = tag.seoCanonicalUrl?.trim() || absoluteUrl(`/${tag.slug}`, settings);
    return {
      title,
      description,
      alternates: { canonical },
      robots: buildRobotsMeta({ index: tag.seoIndex ?? true, follow: true }),
      openGraph: { title, description, url: canonical, type: "website" },
    };
  }

  if (resolution.type === "page") {
    const page = await getPageBySlug(slug);
    if (!page) return {};
    return buildPageMetadata(page, settings);
  }

  return {};
}

// ---------------------------------------------------------------------------
// Page component — delegates to the right renderer
// ---------------------------------------------------------------------------
export default async function SlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const resolution = await resolveSlug(slug);

  if (resolution.type === "game") return <GameRenderer slug={slug} />;
  if (resolution.type === "category") return <CategoryRenderer slug={slug} />;
  if (resolution.type === "tag") return <TagRenderer slug={slug} />;
  if (resolution.type === "page") return <PageRenderer slug={slug} />;

  notFound();
}

// ===========================================================================
// GAME RENDERER
// ===========================================================================
async function GameRenderer({ slug }: { slug: string }) {
  const real = await getRealGameBySlug(slug);
  if (!real) notFound();

  const { game, category } = real;

  if (game.visibility === "private" && !(await isCurrentUserAdmin())) {
    notFound();
  }

  const related = (await getRealGamesByCategory(category.slug)).filter((g) => g.id !== game.id);

  return <GamePageLayout game={game} category={category} related={related} />;
}

async function GamePageLayout({
  game,
  category,
  related,
}: {
  game: Game;
  category: Category;
  related: Game[];
}) {
  const settings = await getSeoSettings();
  const adSettings = await getAdSettings();
  const adsenseReady = adSettings.adsense_enabled && Boolean(adSettings.adsense_client_id);

  const playerAdConfig = {
    enabled: adSettings.player_ads_enabled,
    slotId: adSettings.player_ads_slot_id,
    code: adSettings.player_ads_code,
  };
  const sidebarAdConfig = {
    enabled: adSettings.sidebar_ads_enabled,
    slotId: adSettings.sidebar_ads_slot_id,
    code: adSettings.sidebar_ads_code,
  };
  const customHtmlAdConfig = {
    enabled: adSettings.custom_html_ads_enabled,
    slotId: null,
    code: adSettings.custom_html_ads_code,
  };
  const inGameAdConfig = {
    enabled: adSettings.ingame_ads_enabled,
    slotId: adSettings.ingame_ads_slot_id,
    code: adSettings.ingame_ads_code,
    frequency: adSettings.ingame_ads_frequency,
  };
  const rewardAdConfig = {
    enabled: adSettings.reward_ads_enabled,
    slotId: adSettings.reward_ads_slot_id,
    code: adSettings.reward_ads_code,
    rewardLabel: adSettings.reward_ads_reward_label,
  };

  const showBreadcrumbSchema = game.schemaBreadcrumb ?? true;
  const breadcrumbItems = [
    { name: "Home", path: "/" },
    { name: category.name, path: `/${category.slug}` },
    { name: game.title, path: `/${game.slug}` },
  ];

  const schemas = [
    ...(game.schemaVideoGame ?? true ? [videoGameSchema(game, category, settings)] : []),
    ...(game.schemaSoftwareApplication ?? true ? [softwareApplicationSchema(game, settings)] : []),
    ...(showBreadcrumbSchema ? [breadcrumbSchema(breadcrumbItems, settings)] : []),
  ];

  return (
    <>
      <JsonLd data={schemas} />

      {/* Mobile / iOS / Android */}
      <MobileGamePage
        game={game}
        category={category}
        related={related}
        customHtmlAds={customHtmlAdConfig}
        adsenseClientId={adSettings.adsense_client_id}
        adsenseReady={adsenseReady}
      />

      {/* Desktop / laptop */}
      <div className="hidden flex-col gap-8 px-4 md:px-6 lg:flex">
        <div className="relative -mt-3">
          <div className="flex flex-col gap-8 lg:pr-[324px]">
            <div
              id="desktop-game-player"
              className="mx-auto flex flex-col"
              style={{ width: GAME_FRAME_WIDTH, maxWidth: GAME_FRAME_MAX_WIDTH }}
            >
              <GamePlayerPanel
                game={game}
                category={category}
                adSlot={
                  <HorizontalAdSlot
                    config={playerAdConfig}
                    adsenseClientId={adSettings.adsense_client_id}
                    adsenseReady={adsenseReady}
                  />
                }
                frameHeight={GAME_FRAME_HEIGHT}
                inGameAds={inGameAdConfig}
                rewardAds={rewardAdConfig}
                adsenseClientId={adSettings.adsense_client_id}
                adsenseReady={adsenseReady}
              />
            </div>

            <GameDetailsSection
              game={game}
              category={category}
              customHtmlAds={customHtmlAdConfig}
              adsenseClientId={adSettings.adsense_client_id}
              adsenseReady={adsenseReady}
            />

            <ReviewsSection game={game} />

            <CommentsSection game={game} />
          </div>

          <aside className="absolute right-0 top-0 hidden w-[300px] flex-col gap-5 lg:flex">
            <SidebarAdSlot
              placement="sidebar-top"
              config={sidebarAdConfig}
              adsenseClientId={adSettings.adsense_client_id}
              adsenseReady={adsenseReady}
            />
            <SidebarPlayNextGrid title="Play next" games={related} />
          </aside>
        </div>

        <DesktopBackToGameButton targetId="desktop-game-player" />
      </div>
    </>
  );
}

// ===========================================================================
// CATEGORY RENDERER
// ===========================================================================
async function CategoryRenderer({ slug }: { slug: string }) {
  const [realGames, realCategories, settings] = await Promise.all([
    getAllRealGames(),
    getAllRealCategories(),
    getSeoSettings(),
  ]);

  const category = getCategoryBySlug(slug) ?? realCategories.find((c) => c.slug === slug);
  if (!category) notFound();

  const realGamesInCategory = realGames.filter((g) => g.categorySlug === slug);
  const games = [...realGamesInCategory].sort((a, b) => b.plays - a.plays);
  const newGames = [...realGamesInCategory].sort(
    (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
  );

  const Icon = iconMap[category.icon];

  const breadcrumbItems = [
    { name: "Home", path: "/" },
    { name: category.name, path: `/${category.slug}` },
  ];

  const schemas = [
    ...(category.schemaCollectionPage ?? true
      ? [collectionPageSchema(category, games.length, settings)]
      : []),
    ...(category.breadcrumbsEnabled ?? true ? [breadcrumbSchema(breadcrumbItems, settings)] : []),
  ];

  const bannerGames = games.slice(0, 6);
  const gridGames = games.slice(6);

  const Header = (
    <section
      className="relative overflow-hidden rounded-2xl p-6 sm:p-8"
      style={{ background: `linear-gradient(120deg, ${category.colorTo}, ${category.colorFrom})` }}
    >
      <Icon
        size={180}
        strokeWidth={1}
        className="pointer-events-none absolute -right-6 -top-8 text-white/15"
        aria-hidden
      />
      <div className="relative flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
          <Icon size={24} color="#fff" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">
            {category.seoH1Title?.trim() || category.name}
          </h1>
          <p className="text-sm text-white/80">{category.description}</p>
        </div>
      </div>
      <p className="relative mt-4 text-xs font-semibold text-white/70">{games.length} games</p>
    </section>
  );

  return (
    <>
      <JsonLd data={schemas} />

      {/* Mobile / iOS / Android */}
      <div className="flex flex-col gap-5 lg:hidden">
        <div className="px-4">{Header}</div>
        <div className="flex flex-col gap-3 px-4">
          {bannerGames.map((game) => (
            <FeaturedBanner key={game.id} game={game} category={category} />
          ))}
        </div>
        <CategoryGrid games={gridGames} />
        <div className="px-4">
          <CategoryContentSection content={category.content} />
        </div>
      </div>

      {/* Desktop / laptop */}
      <div className="hidden flex-col gap-5 px-4 md:px-6 lg:flex">
        <Breadcrumbs
          items={breadcrumbItems.map((b) => ({
            name: b.name,
            href: b.path === `/${category.slug}` ? undefined : b.path,
          }))}
        />
        <CategoryPageHeading title={categoryHeadingTitle(category)} description={category.description} />
        <CategoryDesktopGrid games={games} newGames={newGames} defaultSort="top" />
        <CategoryContentSection content={category.content} />
      </div>
    </>
  );
}

// ===========================================================================
// TAG RENDERER
// ===========================================================================
async function TagRenderer({ slug }: { slug: string }) {
  const tag = await getTagBySlug(slug);
  if (!tag) notFound();

  const [posts, settings] = await Promise.all([getPostsByTag(slug), getSeoSettings()]);

  const breadcrumbItems = [
    { name: "Home", path: "/" },
    { name: "Blog", path: "/blog" },
    { name: tag.name, path: `/${tag.slug}` },
  ];

  return (
    <div className="flex flex-col gap-6 px-4 md:px-6">
      <JsonLd data={breadcrumbSchema(breadcrumbItems, settings)} />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <Breadcrumbs
          items={[{ name: "Home", href: "/" }, { name: "Blog", href: "/blog" }, { name: tag.name }]}
        />

        <div className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-black"
            style={{ backgroundColor: tag.color }}
          >
            <TagIcon size={20} />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold text-white">
              {tag.seoH1Title?.trim() || tag.name}
            </h1>
            <p className="text-sm text-text-faint">
              {posts.length} {posts.length === 1 ? "post" : "posts"} tagged &ldquo;{tag.name}&rdquo;
            </p>
          </div>
        </div>

        {posts.length === 0 ? (
          <p className="glass rounded-2xl p-6 text-sm text-text-faint">
            Nothing tagged here yet — check back soon.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {posts.map((post) => (
              <Link
                key={post.id}
                href={`/blog/${post.slug}`}
                className="glass flex flex-col gap-3 rounded-2xl p-5 transition-colors hover:bg-white/[0.08] sm:flex-row sm:items-center"
              >
                {post.coverImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={post.coverImageUrl}
                    alt=""
                    className="h-40 w-full shrink-0 rounded-xl object-cover sm:h-24 sm:w-40"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-lg font-bold text-white">{post.title}</h2>
                  {post.excerpt && (
                    <p className="mt-1 line-clamp-2 text-sm text-text-muted">{post.excerpt}</p>
                  )}
                  <p className="mt-2 text-xs text-text-faint">
                    {post.authorName} ·{" "}
                    {new Date(post.publishedAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// CMS PAGE RENDERER
// ===========================================================================
async function PageRenderer({ slug }: { slug: string }) {
  const page = await getPageBySlug(slug);
  if (!page) notFound();

  const settings = await getSeoSettings();
  const breadcrumbItems = [
    { name: "Home", path: "/" },
    { name: page.title, path: `/${page.slug}` },
  ];

  return (
    <>
      <JsonLd data={breadcrumbSchema(breadcrumbItems, settings)} />
      <StaticPage title={page.seoH1Title?.trim() || page.title} icon={FileText}>
        <RichContent html={page.content} />
      </StaticPage>
    </>
  );
}
