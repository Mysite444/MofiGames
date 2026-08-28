"use client";

import { useRouter } from "next/navigation";
import { Shuffle } from "lucide-react";
import { getRealGamesSnapshot } from "@/lib/supabase/real-games-client";

export function RandomGameButton() {
  const router = useRouter();

  function goToRandomGame() {
    const pool = getRealGamesSnapshot();
    const game = pool[Math.floor(Math.random() * pool.length)];
    if (game) router.push(`/${game.slug}`);
  }

  return (
    <button
      type="button"
      onClick={goToRandomGame}
      className="btn-cta inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm"
    >
      <Shuffle size={18} strokeWidth={2.5} />
      Random Game
    </button>
  );
}
