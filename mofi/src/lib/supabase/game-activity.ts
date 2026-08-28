import { createClient } from "./client";

// Thin wrappers around the `favorites` / `recently_played` tables. Kept
// separate from game-library.ts so that file's localStorage/sync-store
// logic doesn't get tangled up with Supabase query details. All functions
// fail soft (return empty / do nothing on error) — a failed sync shouldn't
// break the favorites button, just leave it in local-only mode for now.

export async function fetchFavoriteSlugs(userId: string): Promise<string[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("favorites")
    .select("slug")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map((row) => row.slug as string);
}

export async function addFavoriteRemote(userId: string, slug: string) {
  const supabase = createClient();
  await supabase.from("favorites").upsert({ user_id: userId, slug });
}

export async function removeFavoriteRemote(userId: string, slug: string) {
  const supabase = createClient();
  await supabase.from("favorites").delete().eq("user_id", userId).eq("slug", slug);
}

export async function fetchRecentlyPlayedSlugs(userId: string, limit: number): Promise<string[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("recently_played")
    .select("slug")
    .eq("user_id", userId)
    .order("played_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map((row) => row.slug as string);
}

export async function recordPlayedRemote(userId: string, slug: string) {
  const supabase = createClient();
  await supabase
    .from("recently_played")
    .upsert({ user_id: userId, slug, played_at: new Date().toISOString() }, { onConflict: "user_id,slug" });
}

export async function clearRecentlyPlayedRemote(userId: string) {
  const supabase = createClient();
  await supabase.from("recently_played").delete().eq("user_id", userId);
}

/** Bumps a real game's play counter by one via the /api/games/:slug/play
 * route (not a direct Supabase write — the `games` table has no non-admin
 * write policy, on purpose, so this has to go through a route that calls a
 * narrowly-scoped RPC instead). Works for anyone, signed in or not — a
 * no-op for placeholder/demo game slugs that aren't real database rows.
 * Fails soft, same policy as the rest of this file. */
export async function incrementPlayCount(slug: string) {
  try {
    await fetch(`/api/games/${encodeURIComponent(slug)}/play`, { method: "POST" });
  } catch {
    // best-effort — a failed play-count bump shouldn't interrupt playing
  }
}

/** Adds `seconds` of real, actually-played time to the signed-in user's
 * running total (see migration 0032 — `play_time` + `add_play_seconds`).
 * Called periodically in small heartbeats while a game is actively
 * playing, never one large jump — see usePlayTimeTracking in
 * game-library.ts, which is the only caller. Fails soft: a dropped
 * heartbeat just slightly undercounts, it never interrupts gameplay. The
 * RPC itself also rejects anything outside a sane per-heartbeat range, so
 * a tampered client can't inflate the total either. */
export async function addPlaySeconds(seconds: number) {
  const whole = Math.round(seconds);
  if (whole <= 0) return;
  try {
    const supabase = createClient();
    await supabase.rpc("add_play_seconds", { seconds: whole });
  } catch {
    // best-effort, same policy as incrementPlayCount above
  }
}

/** Real total play time for an account, in seconds. 0 for a brand-new
 * account (no row yet) — there is no seeded/fake baseline here, unlike the
 * old Profile page stat this replaces. */
export async function fetchTotalPlaySeconds(userId: string): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("play_time")
    .select("total_seconds")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return 0;
  return Number(data.total_seconds) || 0;
}
