import type { SupabaseClient, User } from "@supabase/supabase-js";

/** Inserts one row into admin_action_log. Fire-and-forget on purpose — a
 * logging failure should never fail the admin action it's describing.
 *
 * Use this for admin actions that don't already have a dedicated trail:
 * security settings, access rules, API keys, backup restores/deletes, the
 * role/permission matrix, site identity, and destructive content changes
 * (game/category/page/post deletes). See
 * supabase/migrations/0060_admin_action_log.sql.
 *
 * Actions scoped to one target user (ban/verify/role change/force-logout)
 * should keep using logUserActivity() (user-admin-helpers.ts) — that's
 * still the right table for "what happened to this account". Report/
 * moderation actions should keep using report_audit_log via the reports
 * routes. */
export async function logAdminAction(
  supabase: SupabaseClient,
  actor: Pick<User, "id" | "email">,
  params: {
    action: string;
    targetType?: string;
    targetId?: string;
    summary?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await supabase.from("admin_action_log").insert({
      actor_id: actor.id,
      actor_email: actor.email ?? null,
      action: params.action,
      target_type: params.targetType ?? null,
      target_id: params.targetId ?? null,
      summary: params.summary ?? "",
      metadata: params.metadata ?? {},
    });
  } catch {
    // best-effort, see docstring
  }
}
