import type { SupabaseClient } from "@supabase/supabase-js";

// L-2 fix (2026-09 security audit): the POST /api/games/[slug]/rate endpoint
// had no rate limit, unlike its sibling comment and review endpoints.
//
// The write is an upsert on (user_id, game_id), so repeated calls overwrite
// the same row rather than creating new ones — rating manipulation is not
// feasible, but unlimited rapid firing wastes DB resources.  This helper
// applies a lightweight cooldown (5 seconds between changes) and a per-hour
// cap (60 ratings/hr — generous for any legitimate use) using the same
// DB-backed pattern as checkReviewRateLimit() so it works correctly across
// multiple Next.js server instances that don't share in-memory state.

const COOLDOWN_MS  = 5_000;   // minimum gap between any two rating writes
const MAX_PER_HOUR = 60;       // a user can rate at most 60 games per hour
const WINDOW_MS    = 60 * 60 * 1000;

export interface RateLimitResult {
  limited: boolean;
  message?: string;
  retryAfterSeconds?: number;
}

export async function checkRatingRateLimit(
  supabase: SupabaseClient,
  userId: string
): Promise<RateLimitResult> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();

  // One query: the user's most-recently-updated rating in the last hour
  // (for the cooldown check) plus the count (for the flood cap).
  const { data, count, error } = await supabase
    .from("game_ratings")
    .select("updated_at", { count: "exact" })
    .eq("user_id", userId)
    .gte("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(1);

  // Fail open — a broken rate-limit query must never silently drop a
  // legitimate rating.
  if (error) return { limited: false };

  if ((count ?? 0) >= MAX_PER_HOUR) {
    return {
      limited: true,
      message: "You've been rating a lot of games — take a short break and try again.",
      retryAfterSeconds: 10 * 60,
    };
  }

  const lastUpdatedAt = data?.[0]?.updated_at;
  if (lastUpdatedAt) {
    const elapsedMs = Date.now() - new Date(lastUpdatedAt).getTime();
    if (elapsedMs < COOLDOWN_MS) {
      return {
        limited: true,
        message: "Rating a bit fast — wait a moment and try again.",
        retryAfterSeconds: Math.ceil((COOLDOWN_MS - elapsedMs) / 1000),
      };
    }
  }

  return { limited: false };
}
