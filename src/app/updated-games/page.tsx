import { RefreshCw } from "lucide-react";
import { getCategoryBySlug } from "@/lib/categories";
import { getAllRealGames, getAllRealCategories } from "@/lib/games-server";
import { FeaturedBanner } from "@/components/FeaturedBanner";
import { CategoryGrid } from "@/components/CategoryGrid";
import { CategoryPageHeading } from "@/components/CategoryPageHeading";
import { CategoryDesktopGrid } from "@/components/CategoryDesktopGrid";

export const metadata = {
  title: "Updated Games — MofiGames",
  description: "Recently updated games with fresh patches and new content.",
};

export default async function UpdatedGamesPage() {
  const [realGames, realCategories] = await Promise.all([getAllRealGames(), getAllRealCategories()]);
  function categoryFor(slug: string) {
    return getCategoryBySlug(slug) ?? realCategories.find((c) => c.slug === slug);
  }

  // UPDATED-tagged games first (tagged that way in the admin panel), then the rest
  const realUpdated = realGames.filter((g) => g.tag === "UPDATED");
  const rest = realGames.filter((g) => g.tag !== "UPDATED");
  const games = [...realUpdated, ...rest];

  const bannerGames = games.slice(0, 6);
  const gridGames = games.slice(6);

  const Header = (
    <section
      className="relative overflow-hidden rounded-2xl p-6 sm:p-8"
      style={{ background: "linear-gradient(120deg, #064E3B, #2DE2C5)" }}
    >
      <RefreshCw
        size={180}
        strokeWidth={1}
        className="pointer-events-none absolute -right-6 -top-8 text-white/15"
        aria-hidden
      />
      <div className="relative flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
          <RefreshCw size={24} color="#fff" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">
            Updated Games
          </h1>
          <p className="text-sm text-white/80">Fresh patches and new content</p>
        </div>
      </div>
      <p className="relative mt-4 text-xs font-semibold text-white/70">
        {realUpdated.length} recently updated
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
        <CategoryPageHeading title="Updated Games" description="Fresh patches and new content" />
        <CategoryDesktopGrid games={games} />
      </div>
    </>
  );
}
