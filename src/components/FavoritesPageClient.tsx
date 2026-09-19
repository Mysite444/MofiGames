"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark } from "lucide-react";
import { useFavoriteSlugs } from "@/lib/game-library";
import { useMergedGames } from "@/lib/games-merged";
import { FeaturedBanner } from "./FeaturedBanner";
import { CategoryGrid } from "./CategoryGrid";
import { CategoryPageHeading } from "./CategoryPageHeading";
import { CategoryDesktopGrid } from "./CategoryDesktopGrid";
import type { Game } from "@/lib/types";

function EmptyState() {
  return (
    <div className="flex flex-col items-center px-4 py-14 text-center sm:py-20 md:px-6">
      <span className="glass-strong flex h-16 w-16 items-center justify-center rounded-2xl text-white">
        <Bookmark size={28} />
      </span>
      <h1 className="mt-5 font-display text-2xl font-bold text-white">No bookmarks yet</h1>
      <p className="mt-2 max-w-xs text-sm text-text-faint">
        Tap the bookmark icon on any game to save it here for next time.
      </p>
      <Link
        href="/"
        className="glow-yellow-button mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-menu-bg)] px-6 py-3 text-sm font-bold text-white active:scale-[0.98]"
      >
        Browse Games
      </Link>
    </div>
  );
}

/**
 * Real favorited games, read from localStorage via lib/game-library.ts —
 * the heart button on the desktop player bar and the mobile game page both
 * write here. Client-only by nature (this data doesn't exist on the
 * server), so it waits for mount before rendering anything so it never
 * flashes between an empty state and a populated grid.
 */
export function FavoritesPageClient() {
  const slugs = useFavoriteSlugs();
  const { games: allGames, categories: allCategories } = useMergedGames();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard "wait for client mount before reading localStorage-backed data" guard, same pattern as auth-context's `ready` flag elsewhere in this app.
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="px-4 py-14 md:px-6" aria-hidden />;
  }

  const bySlug = new Map(allGames.map((g) => [g.slug, g]));
  const games = slugs.map((slug) => bySlug.get(slug)).filter((g): g is Game => Boolean(g));
  const categoryFor = (slug: string) => allCategories.find((c) => c.slug === slug);

  if (games.length === 0) {
    return <EmptyState />;
  }

  const bannerGames = games.slice(0, 6);
  const gridGames = games.slice(6);

  const Header = (
    <section
      className="relative overflow-hidden rounded-2xl p-6 sm:p-8"
      style={{ background: "linear-gradient(120deg, #0c1f4a, #3DA9FC)" }}
    >
      <Bookmark
        size={180}
        strokeWidth={1}
        className="pointer-events-none absolute -right-6 -top-8 text-white/15"
        aria-hidden
      />
      <div className="relative flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
          <Bookmark size={24} color="#fff" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">
            Bookmarks
          </h1>
          <p className="text-sm text-white/80">Games you&apos;ve saved to play later</p>
        </div>
      </div>
      <p className="relative mt-4 text-xs font-semibold text-white/70">
        {games.length} {games.length === 1 ? "game" : "games"} saved
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

        {gridGames.length > 0 && <CategoryGrid games={gridGames} />}
      </div>

      {/* Desktop / laptop */}
      <div className="hidden flex-col gap-5 px-4 md:px-6 lg:flex">
        <CategoryPageHeading title="Favorites" description="Games you've saved to play later" />
        <CategoryDesktopGrid games={games} />
      </div>
    </>
  );
}
