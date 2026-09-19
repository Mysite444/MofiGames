import type { SupabaseClient } from "@supabase/supabase-js";

// Comment posting had no throttle at all beyond "must be signed in" — one
// script (or one impatient double-click) could flood a game's comment
// section. This checks against the `comments` table itself rather than an
// in-memory counter, since Next.js route handlers can run across multiple
// server instances that wouldn't share an in-memory map — a DB check is
// the only version of this that's actually correct in that environment.

const COOLDOWN_MS = 8_000; // minimum gap between a user's own comments
const MAX_PER_HOUR = 30; // generous — well above any normal usage pattern
const WINDOW_MS = 60 * 60 * 1000;

export interface RateLimitResult {
  limited: boolean;
  message?: string;
  retryAfterSeconds?: number;
}

export async function checkCommentRateLimit(
  supabase: SupabaseClient,
  userId: string
): Promise<RateLimitResult> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();

  // Ordered newest-first with a count: the single row returned (if any) is
  // the user's most recent comment (for the cooldown check), and `count`
  // is the total within the last hour (for the flood cap) — one query
  // covers both checks.
  const { data, count, error } = await supabase
    .from("comments")
    .select("created_at", { count: "exact" })
    .eq("user_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);

  // Fail open — a rate-limit check that can't run shouldn't be the reason
  // a legitimate comment fails to post.
  if (error) return { limited: false };

  if ((count ?? 0) >= MAX_PER_HOUR) {
    return {
      limited: true,
      message: "You've posted a lot of comments recently — try again in a bit.",
      retryAfterSeconds: 60 * 10,
    };
  }

  const lastCreatedAt = data?.[0]?.created_at;
  if (lastCreatedAt) {
    const elapsedMs = Date.now() - new Date(lastCreatedAt).getTime();
    if (elapsedMs < COOLDOWN_MS) {
      return {
        limited: true,
        message: "You're posting a little fast — give it a few seconds.",
        retryAfterSeconds: Math.ceil((COOLDOWN_MS - elapsedMs) / 1000),
      };
    }
  }

  return { limited: false };
}
