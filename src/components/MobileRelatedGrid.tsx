"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { GameCard } from "./GameCard";
import type { Game } from "@/lib/types";

const BATCH_SIZE = 18;

export function MobileRelatedGrid({ games }: { games: Game[] }) {
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const visible = games.slice(0, visibleCount);
  const hasMore = visibleCount < games.length;

  if (games.length === 0) return null;

  return (
    <div>
      <div className="grid grid-cols-3 gap-2.5">
        {visible.map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={() => setVisibleCount((c) => c + BATCH_SIZE)}
          className="btn-cta mt-4 flex w-full items-center justify-center gap-2 py-3 text-sm"
        >
          Show more
          <ChevronDown size={16} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}
