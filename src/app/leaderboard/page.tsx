import Link from "next/link";
import { Medal, Star, Trophy } from "lucide-react";
import { getCategoryBySlug } from "@/lib/categories";
import { formatPlays } from "@/lib/format-plays";
import { getAllRealGames, getAllRealCategories } from "@/lib/games-server";
import { GameThumbnail } from "@/components/GameThumbnail";
import { FeaturedBanner } from "@/components/FeaturedBanner";

export const metadata = {
  title: "Leaderboard — MofiGames",
  description: "The most-played games on MofiGames, ranked.",
};

export default async function LeaderboardPage() {
  const [realGames, realCategories] = await Promise.all([getAllRealGames(), getAllRealCategories()]);
  function categoryFor(slug: string) {
    return getCategoryBySlug(slug) ?? realCategories.find((c) => c.slug === slug);
  }

  const games = [...realGames].sort((a, b) => b.plays - a.plays).slice(0, 50);
  const bannerGames = games.slice(0, 3);
  const listGames = games.slice(3);

  const Header = (
    <section
      className="relative overflow-hidden rounded-2xl p-6 sm:p-8"
      style={{ background: "linear-gradient(120deg, #78350F, #F59E0B)" }}
    >
      <Trophy
        size={180}
        strokeWidth={1}
        className="pointer-events-none absolute -right-6 -top-8 text-white/15"
        aria-hidden
      />
      <div className="relative flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
          <Medal size={24} color="#fff" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">
            Leaderboard
          </h1>
          <p className="text-sm text-white/80">The most-played games on MofiGames, ranked.</p>
        </div>
      </div>
      <p className="relative mt-4 text-xs font-semibold text-white/70">
        Top {games.length} games by total plays
      </p>
    </section>
  );

  const RankedList = ({ startRank }: { startRank: number }) => (
    <div className="glass flex flex-col divide-y divide-white/10 overflow-hidden rounded-2xl">
      {listGames.map((game, i) => {
        const category = categoryFor(game.categorySlug);
        if (!game.thumbnailUrl && !category) return null;
        const rank = startRank + i;
        return (
          <Link
            key={game.id}
            href={`/${game.slug}`}
            className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-white/[0.06] sm:gap-4 sm:px-4"
          >
            <span
              className={`w-7 shrink-0 text-center font-display text-sm font-bold sm:w-9 sm:text-base ${
                rank <= 3 ? "text-white glow-text" : "text-text-faint"
              }`}
            >
              {rank}
            </span>
            {game.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={game.thumbnailUrl}
                alt=""
                className="h-12 w-12 shrink-0 rounded-lg object-cover sm:h-14 sm:w-14"
              />
            ) : (
              <GameThumbnail
                category={category!}
                variant={game.variant}
                className="h-12 w-12 shrink-0 rounded-lg sm:h-14 sm:w-14"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white sm:text-base">{game.title}</p>
              <p className="truncate text-xs text-text-faint">{category?.name}</p>
            </div>
            <span className="hidden items-center gap-1 text-sm text-text-muted sm:flex">
              <Star size={13} className="fill-gold text-gold" />
              {game.rating}
            </span>
            <span className="shrink-0 text-right text-xs font-medium text-text-muted sm:w-24 sm:text-sm">
              {formatPlays(game.plays)} plays
            </span>
          </Link>
        );
      })}
    </div>
  );

  return (
    <>
      {/* Mobile / iOS / Android */}
      <div className="flex flex-col gap-5 lg:hidden">
        <div className="px-4">{Header}</div>

        {/* Top 3 as featured banners */}
        <div className="flex flex-col gap-3 px-4">
          {bannerGames.map((game) => (
            <FeaturedBanner key={game.id} game={game} category={categoryFor(game.categorySlug)} />
          ))}
        </div>

        {/* Rank 4–50 as list */}
        <div className="px-4">
          <RankedList startRank={4} />
        </div>
      </div>

      {/* Desktop / laptop */}
      <div className="hidden flex-col gap-6 px-4 md:px-6 lg:flex">
        {Header}
        <div className="glass flex flex-col divide-y divide-white/10 overflow-hidden rounded-2xl">
          {games.map((game, i) => {
            const category = categoryFor(game.categorySlug);
            if (!game.thumbnailUrl && !category) return null;
            const rank = i + 1;
            return (
              <Link
                key={game.id}
                href={`/${game.slug}`}
                className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-white/[0.06] sm:gap-4 sm:px-4"
              >
                <span
                  className={`w-7 shrink-0 text-center font-display text-sm font-bold sm:w-9 sm:text-base ${
                    rank <= 3 ? "text-white glow-text" : "text-text-faint"
                  }`}
                >
                  {rank}
                </span>
                {game.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={game.thumbnailUrl}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-lg object-cover sm:h-14 sm:w-14"
                  />
                ) : (
                  <GameThumbnail
                    category={category!}
                    variant={game.variant}
                    className="h-12 w-12 shrink-0 rounded-lg sm:h-14 sm:w-14"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white sm:text-base">{game.title}</p>
                  <p className="truncate text-xs text-text-faint">{category?.name}</p>
                </div>
                <span className="hidden items-center gap-1 text-sm text-text-muted sm:flex">
                  <Star size={13} className="fill-gold text-gold" />
                  {game.rating}
                </span>
                <span className="shrink-0 text-right text-xs font-medium text-text-muted sm:w-24 sm:text-sm">
                  {formatPlays(game.plays)} plays
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
