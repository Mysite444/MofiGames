import { Flame } from "lucide-react";
import { getCategoryBySlug, mergeCategoryWithDb } from "@/lib/categories";
import { getAllRealGames, getAllRealCategories } from "@/lib/games-server";
import { FeaturedBanner } from "@/components/FeaturedBanner";
import { CategoryGrid } from "@/components/CategoryGrid";
import { CategoryPageHeading } from "@/components/CategoryPageHeading";
import { CategoryDesktopGrid } from "@/components/CategoryDesktopGrid";

export const metadata = {
  title: "Popular Games — MofiGames",
  description: "The most-played games on MofiGames right now.",
};

export default async function PopularGamesPage() {
  const [realGames, realCategories] = await Promise.all([getAllRealGames(), getAllRealCategories()]);
  function categoryFor(slug: string) {
    // DB data wins for built-in categories so admin edits are reflected here.
    const staticCat = getCategoryBySlug(slug);
    const dbCat = realCategories.find((c) => c.slug === slug);
    if (!staticCat) return dbCat;
    return mergeCategoryWithDb(staticCat, dbCat);
  }

  const games = [...realGames].sort((a, b) => b.plays - a.plays);
  const bannerGames = games.slice(0, 6);
  const gridGames = games.slice(6);

  const Header = (
    <section
      className="relative overflow-hidden rounded-2xl p-6 sm:p-8"
      style={{ background: "linear-gradient(120deg, #7C1D33, #FF5D73)" }}
    >
      <Flame
        size={180}
        strokeWidth={1}
        className="pointer-events-none absolute -right-6 -top-8 text-white/15"
        aria-hidden
      />
      <div className="relative flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
          <Flame size={24} color="#fff" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">
            Popular Games
          </h1>
          <p className="text-sm text-white/80">What everyone&apos;s playing right now</p>
        </div>
      </div>
      <p className="relative mt-4 text-xs font-semibold text-white/70">
        {games.length} games ranked by plays
      </p>
    </section>
  );

  return (
    <>
      {/* Mobile / iOS / Android */}
      <div className="flex flex-col gap-5 lg:hidden">
        <div className="px-4">{Header}</div>

        <div className="flex flex-col gap-3 px-4">
          {bannerGames.map((game) => (
            <FeaturedBanner key={game.id} game={game} category={categoryFor(game.categorySlug)} />
          ))}
        </div>

        <CategoryGrid games={gridGames} />
      </div>

      {/* Desktop / laptop */}
      <div className="hidden flex-col gap-5 px-4 md:px-6 lg:flex">
        <CategoryPageHeading title="Popular Games" description="What everyone's playing right now" />
        <CategoryDesktopGrid games={games} />
      </div>
    </>
  );
}
