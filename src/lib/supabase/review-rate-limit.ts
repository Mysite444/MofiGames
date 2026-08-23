import type { SupabaseClient } from "@supabase/supabase-js";

// Review posting had no throttle beyond "must be signed in" and the DB's
// unique(user_id, game_id) constraint.  While that constraint means you
// can only have one review per game, nothing stopped a script from rapidly
// cycling through many games and flooding the reviews table.  This checks
// against the `game_reviews` table itself (not an in-memory counter) for
// the same reason as comment-rate-limit.ts: Next.js route handlers can run
// across multiple server instances that don't share memory.

const COOLDOWN_MS = 30_000; // minimum gap between any two review writes by the same user
const MAX_PER_HOUR = 5; // generous for a normal user; stops automated flooding
const WINDOW_MS = 60 * 60 * 1000;

export interface RateLimitResult {
  limited: boolean;
  message?: string;
  retryAfterSeconds?: number;
}

export async function checkReviewRateLimit(
  supabase: SupabaseClient,
  userId: string
): Promise<RateLimitResult> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();

  // One query: newest write in the last hour (for the cooldown check), plus
  // count (for the flood cap) — same pattern as checkCommentRateLimit().
  const { data, count, error } = await supabase
    .from("game_reviews")
    .select("updated_at", { count: "exact" })
    .eq("user_id", userId)
    .gte("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(1);

  // Fail open — a broken rate-limit check should never silently drop a
  // legitimate review.
  if (error) return { limited: false };

  if ((count ?? 0) >= MAX_PER_HOUR) {
    return {
      limited: true,
      message: "You've submitted a lot of reviews recently — try again in a bit.",
      retryAfterSeconds: 60 * 10,
    };
  }

  const lastUpdatedAt = data?.[0]?.updated_at;
  if (lastUpdatedAt) {
    const elapsedMs = Date.now() - new Date(lastUpdatedAt).getTime();
    if (elapsedMs < COOLDOWN_MS) {
      return {
        limited: true,
        message: "You're submitting reviews a little fast — give it a few seconds.",
        retryAfterSeconds: Math.ceil((COOLDOWN_MS - elapsedMs) / 1000),
      };
    }
  }

  return { limited: false };
}
