"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ContinuePlayingCard } from "./ContinuePlayingCard";
import { MobileGameRow } from "./MobileGameRow";
import { useRecentlyPlayedSlugs } from "@/lib/game-library";
import { useMergedGames } from "@/lib/games-merged";
import type { Game } from "@/lib/types";

function useRecentlyPlayedGames(limit: number): Game[] {
  const slugs = useRecentlyPlayedSlugs();
  const { games: allGames } = useMergedGames();
  const bySlug = new Map(allGames.map((g) => [g.slug, g]));
  return slugs
    .slice(0, limit)
    .map((slug) => bySlug.get(slug))
    .filter((g): g is Game => Boolean(g));
}

/** Desktop/laptop homepage — single most-recent thumbnail, same spot/size
 * as before, now backed by real play history instead of a stand-in. Renders
 * nothing (no empty section) until the visitor has actually played a game. */
export function ContinuePlayingDesktop() {
  const games = useRecentlyPlayedGames(1);
  if (games.length === 0) return null;

  return (
    <section className="px-4 md:px-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-extrabold leading-tight text-text md:text-xl">
          Continue Playing
        </h2>
        <Link
          href="/recently-played"
          className="flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:bg-white/10 hover:text-white"
        >
          See all
          <ArrowRight size={13} />
        </Link>
      </div>
      <ContinuePlayingCard game={games[0]} />
    </section>
  );
}

/** Mobile/iOS/Android homepage — same row component/sizing used everywhere
 * else (3 items, no horizontal scroll), now backed by real play history.
 * MobileGameRow already hides itself when given an empty list. */
export function ContinuePlayingMobile() {
  const games = useRecentlyPlayedGames(3);

  return (
    <MobileGameRow
      title="Continue Playing"
      icon="Flame"
      accent="#ffffff"
      games={games}
      viewMoreHref="/recently-played"
      scroll={false}
    />
  );
}
