import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceRoleClient } from "./admin-client";

export interface ViewerCapabilities {
  role: string;
  isAdmin: boolean;
  canBanUsers: boolean;
  canVerifyUsers: boolean;
  canManageReports: boolean;
  canViewActivityLogs: boolean;
  canModerateComments: boolean;
  /** Role changes and the permission matrix itself are always admin-only,
   * regardless of the permission system — never grantable, to keep
   * privilege escalation impossible to configure away. */
  canManageRoles: boolean;
  /** Force-logout needs the service-role client (Supabase Admin API) on
   * top of being an admin — surfaced separately so the UI can explain
   * *why* it's unavailable, not just that it is. */
  sessionManagementAvailable: boolean;
}

/** Computes what the current viewer (an already-authenticated staff
 * member) is allowed to do, via the same has_permission() RPC the RLS
 * policies use — one source of truth for "can this person do X". Embedded
 * in list/detail API responses so each admin screen can conditionally
 * render its own buttons without a separate round trip. */
export async function getViewerCapabilities(
  supabase: SupabaseClient,
  userId: string
): Promise<ViewerCapabilities> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_admin")
    .eq("id", userId)
    .maybeSingle();

  const isAdmin = Boolean(profile?.is_admin);
  const role = isAdmin ? "admin" : profile?.role ?? "user";

  if (isAdmin) {
    return {
      role,
      isAdmin: true,
      canBanUsers: true,
      canVerifyUsers: true,
      canManageReports: true,
      canViewActivityLogs: true,
      canModerateComments: true,
      canManageRoles: true,
      sessionManagementAvailable: Boolean(getServiceRoleClient()),
    };
  }

  const checks = await Promise.all(
    (["ban_users", "verify_users", "manage_reports", "view_activity_logs", "moderate_comments"] as const).map(
      (perm) => supabase.rpc("has_permission", { perm }).then(({ data }) => Boolean(data))
    )
  );

  return {
    role,
    isAdmin: false,
    canBanUsers: checks[0],
    canVerifyUsers: checks[1],
    canManageReports: checks[2],
    canViewActivityLogs: checks[3],
    canModerateComments: checks[4],
    canManageRoles: false,
    sessionManagementAvailable: false,
  };
}

export interface AuthEnrichment {
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
  provider: string | null;
  isAnonymous: boolean;
  authBannedUntil: string | null;
}

/** Enriches a page of user ids with auth.users data (last sign-in,
 * email-confirmed, provider, native ban state) via the Supabase Admin API
 * — only possible when SUPABASE_SERVICE_ROLE_KEY is configured. Bounded
 * to a small page of ids at a time (parallel getUserById calls), so this
 * is only ever called with one page of results, never a whole table. */
export async function enrichWithAuthData(userIds: string[]): Promise<Map<string, AuthEnrichment>> {
  const map = new Map<string, AuthEnrichment>();
  const admin = getServiceRoleClient();
  if (!admin || userIds.length === 0) return map;

  await Promise.all(
    userIds.map(async (id) => {
      try {
        const { data } = await admin.auth.admin.getUserById(id);
        if (!data?.user) return;
        const u = data.user;
        map.set(id, {
          lastSignInAt: u.last_sign_in_at ?? null,
          emailConfirmedAt: u.email_confirmed_at ?? null,
          provider: (u.app_metadata?.provider as string | undefined) ?? null,
          isAnonymous: Boolean(u.is_anonymous),
          authBannedUntil: (u as { banned_until?: string | null }).banned_until ?? null,
        });
      } catch {
        // Best-effort enrichment — a lookup failure for one user shouldn't
        // fail the whole list.
      }
    })
  );

  return map;
}

/** Inserts one row into user_activity_logs. Fire-and-forget on purpose —
 * a logging failure should never fail the primary action (banning,
 * verifying, role change, etc.) it's describing. */
export async function logUserActivity(
  supabase: SupabaseClient,
  params: {
    userId: string;
    activityType: string;
    description?: string;
    metadata?: Record<string, unknown>;
    actorId?: string;
  }
): Promise<void> {
  try {
    await supabase.from("user_activity_logs").insert({
      user_id: params.userId,
      activity_type: params.activityType,
      description: params.description ?? "",
      metadata: params.metadata ?? {},
      actor_id: params.actorId ?? null,
    });
  } catch {
    // best-effort, see docstring
  }
}
