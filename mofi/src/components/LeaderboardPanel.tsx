"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy, Clock, Users } from "lucide-react";
import { GameCard } from "./GameCard";
import { GenreGameCard } from "./GenreGameCard";
import type { Game } from "@/lib/types";

// Same fixed size used by every regular CategoryRow (Editor's Picks, Featured,
// etc.) on desktop/laptop — 202px x 114px, ~16:9. Matching it here so the
// Leaderboards row's tiles look identical to Editor's Picks instead of the
// square GameCard tiles used on mobile.
const DESKTOP_CARD_SIZE = { width: "202px", height: "114px" };

function useCountdownToNextMonday() {
  const [label, setLabel] = useState("");

  useEffect(() => {
    function tick() {
      const now = new Date();
      const next = new Date(now);
      const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
      next.setDate(now.getDate() + daysUntilMonday);
      next.setHours(0, 0, 0, 0);
      const diffMs = next.getTime() - now.getTime();
      const h = Math.floor(diffMs / 3_600_000);
      const m = Math.floor((diffMs % 3_600_000) / 60_000);
      setLabel(`${h}h ${m}m`);
    }
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  return label;
}

export function LeaderboardPanel({ games }: { games: Game[] }) {
  const countdown = useCountdownToNextMonday();

  return (
    <section className="relative overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 25% 0%, rgba(255,214,10,0.16), transparent 60%), linear-gradient(to bottom, #1a140a, #0d0d10 70%, transparent)",
        }}
        aria-hidden
      />
      <div className="relative px-4 pt-5 md:px-6">
        <Trophy size={40} className="fill-gold text-gold" />

        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold text-white">Leaderboards</h2>
            <Link href="/leaderboard" className="text-sm font-semibold text-white/70 underline-offset-2 hover:underline">
              View more
            </Link>
          </div>
          <span className="glass flex shrink-0 flex-col items-center rounded-xl px-3 py-1.5 text-center text-[11px] text-text-muted">
            <span className="flex items-center gap-1">
              <Clock size={11} /> Ends in
            </span>
            <span className="font-semibold text-white">{countdown || "—"}</span>
          </span>
        </div>

        <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-400">
          <Users size={12} />
          New season
        </span>

        <p className="mt-2 text-sm text-text-muted">Compete with other players and reach the top.</p>
      </div>

      {/* Mobile/iOS/Android — untouched, square GameCard tiles. */}
      <div className="relative mt-2 flex gap-2.5 overflow-x-auto pt-2 pb-2 pl-4 scrollbar-hide snap-rail md:pl-6 lg:hidden">
        {games.map((g) => (
          <div key={g.id} className="w-[84px] shrink-0 snap-card min-[400px]:w-[92px]">
            <GameCard game={g} />
          </div>
        ))}
        <div className="w-2 shrink-0" aria-hidden />
      </div>

      {/* Desktop/laptop — same tile (GenreGameCard, 202x114) and sizing used
          by every other CategoryRow (Editor's Picks, Featured, etc.), so
          this row matches them instead of using square GameCard tiles. */}
      <div className="relative mt-2 hidden gap-3.5 overflow-x-auto pt-1 pb-2 pl-6 scrollbar-hide snap-rail lg:flex">
        {games.map((g) => (
          <div key={g.id} className="snap-card shrink-0" style={DESKTOP_CARD_SIZE}>
            <GenreGameCard game={g} />
          </div>
        ))}
        <div className="w-2 shrink-0" aria-hidden />
      </div>
    </section>
  );
}
