import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — server-only, NEVER imported into anything
 * that ships to the browser. Used exclusively for the handful of things
 * that need Supabase's Admin API and can't be done through RLS at all:
 * reading a user's last-sign-in time / email-confirmed status, and force-
 * revoking their sessions (Admin → User Management → Login & Session
 * Management).
 *
 * Returns null when SUPABASE_SERVICE_ROLE_KEY isn't set rather than
 * throwing — every caller treats that as "session management isn't
 * available yet" and degrades gracefully, the same pattern this project
 * already uses for the optional ANTHROPIC_API_KEY.
 */
export function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
