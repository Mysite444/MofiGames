import type { SupabaseClient } from "@supabase/supabase-js";

/** Records one hit for `key` and reports whether the caller is still
 * under `max` hits within the trailing `windowSeconds` — see
 * hit_rate_limit() in supabase/migrations/0018_attack_surface_protection.sql.
 * Fails open (returns true / "allowed") on any error: a broken rate
 * limiter should never be the reason a legitimate request is rejected. */
export async function checkRateLimit(
  supabase: SupabaseClient,
  key: string,
  windowSeconds: number,
  max: number
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("hit_rate_limit", {
      p_key: key,
      p_window_seconds: windowSeconds,
      p_max: max,
    });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}
