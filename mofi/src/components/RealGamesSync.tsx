"use client";

import { useEffect } from "react";
import { getRealGamesSnapshot } from "@/lib/supabase/real-games-client";

/** Renders nothing. Just warms the real-games cache on mount so it's
 * already loading (or loaded) before any component further down the tree
 * needs it. Safe to call repeatedly — the cache only fetches once. */
export function RealGamesSync() {
  useEffect(() => {
    getRealGamesSnapshot();
  }, []);

  return null;
}
