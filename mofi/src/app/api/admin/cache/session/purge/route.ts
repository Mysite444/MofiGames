import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { redactSecret } from "@/lib/session-cache-settings";

/** POST /api/admin/cache/session/purge — Admin → Cache → Session Cache →
 * Database Sessions → "Purge Expired Sessions". Admin-only. Deletes every
 * row in session_store (migration 0043) whose expires_at has passed, and
 * records when/how many. Doesn't touch Supabase Auth's own session
 * tables (auth.sessions / auth.refresh_tokens) — those aren't app schema
 * and expire/rotate under Supabase's own rules; this purges only the
 * app-owned session_store table. */
export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const { data: deleted, error: deleteError } = await supabase
    .from("session_store")
    .delete()
    .lt("expires_at", new Date().toISOString())
    .select("session_key");

  if (deleteError) {
    return NextResponse.json({ error: "Failed to purge expired sessions." }, { status: 500 });
  }

  const purgedCount = deleted?.length ?? 0;
  const now = new Date().toISOString();

  const { data: updated, error: updateError } = await supabase
    .from("session_cache_settings")
    .update({
      db_sessions_last_purged_at: now,
      db_sessions_last_purge_count: purgedCount,
      updated_by: user.id,
    })
    .eq("id", true)
    .select("*")
    .single();

  if (updateError || !updated) {
    return NextResponse.json({ error: "Purge ran but failed to record the result." }, { status: 500 });
  }

  const { count: remainingCount } = await supabase
    .from("session_store")
    .select("session_key", { count: "exact", head: true });

  const { redis_password, session_secret, ...rest } = updated as Record<string, unknown> & {
    redis_password?: string | null;
    session_secret?: string | null;
  };
  const redisRedacted = redactSecret(redis_password ?? null);
  const secretRedacted = redactSecret(session_secret ?? null);

  return NextResponse.json({
    result: {
      ok: true,
      message:
        purgedCount > 0
          ? `Purged ${purgedCount} expired session${purgedCount === 1 ? "" : "s"} from session_store.`
          : "No expired sessions found in session_store.",
      purgedCount,
      remainingCount: remainingCount ?? 0,
    },
    settings: {
      ...rest,
      redis_password_set: redisRedacted.set,
      redis_password_preview: redisRedacted.preview,
      session_secret_set: secretRedacted.set,
      session_secret_preview: secretRedacted.preview,
    },
  });
}
