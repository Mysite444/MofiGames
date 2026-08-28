import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "./server";

// Small shared helpers for API route handlers (src/app/api/**). Every
// mutation ultimately stays protected by RLS regardless of what happens
// here — these just let routes fail fast with a clean, specific HTTP
// status instead of letting a Postgres RLS error bubble up as a generic
// 500, and centralize the "am I an admin" check so it isn't re-implemented
// slightly differently in every route.

export interface RouteContext {
  supabase: SupabaseClient;
  user: User;
}

/** Requires a signed-in session (real or anonymous/guest). Returns null
 * (having already reflected the failure to the caller via the returned
 * response) when there isn't one. */
export async function requireUser(): Promise<
  { ok: true; ctx: RouteContext } | { ok: false; status: number; message: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false, status: 401, message: "You must be signed in to do that." };
  }

  return { ok: true, ctx: { supabase, user } };
}

/** Requires a signed-in session belonging to an admin (profiles.is_admin).
 * Mirrors the RLS `is_admin()` policies on games/categories/storage — this
 * is a second, explicit check so admin routes return a clear 403 instead of
 * relying solely on the database rejecting the write. */
export async function requireAdmin(): Promise<
  { ok: true; ctx: RouteContext } | { ok: false; status: number; message: string }
> {
  const result = await requireUser();
  if (!result.ok) return result;

  const { supabase, user } = result.ctx;
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, message: "Could not verify admin access." };
  }
  if (!profile?.is_admin) {
    return { ok: false, status: 403, message: "Admin access required." };
  }

  return { ok: true, ctx: { supabase, user } };
}

/** Checks whether the given (already-authenticated) user is an admin,
 * without failing the request if they're not — for routes where either
 * the resource's owner *or* an admin may act (e.g. deleting a comment). */
export async function isAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase.from("profiles").select("is_admin").eq("id", userId).maybeSingle();
  return Boolean(data?.is_admin);
}

/** Requires a signed-in session belonging to staff (role admin, editor, or
 * moderator) — the minimum bar to view any User Management screen. Finer-
 * grained actions within those screens should additionally check
 * requirePermission() for the specific capability involved. */
export async function requireStaff(): Promise<
  { ok: true; ctx: RouteContext & { role: string } } | { ok: false; status: number; message: string }
> {
  const result = await requireUser();
  if (!result.ok) return result;

  const { supabase, user } = result.ctx;
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, message: "Could not verify staff access." };
  }
  const role = profile?.is_admin ? "admin" : profile?.role ?? "user";
  if (role === "user") {
    return { ok: false, status: 403, message: "Staff access required." };
  }

  return { ok: true, ctx: { supabase, user, role } };
}

/** Requires a signed-in session with the given permission — admins always
 * pass; moderator/editor pass if role_permissions or a per-user override
 * grants it (see has_permission() in migration 0012). Delegates the actual
 * check to the database via .rpc() so there's exactly one place (the SQL
 * function) that decides what "having a permission" means. */
export async function requirePermission(
  permission: string
): Promise<{ ok: true; ctx: RouteContext } | { ok: false; status: number; message: string }> {
  const result = await requireUser();
  if (!result.ok) return result;

  const { supabase, user } = result.ctx;
  const { data: granted, error } = await supabase.rpc("has_permission", { perm: permission });

  if (error) {
    return { ok: false, status: 500, message: "Could not verify permissions." };
  }
  if (!granted) {
    return { ok: false, status: 403, message: "You don't have permission to do that." };
  }

  return { ok: true, ctx: { supabase, user } };
}

/** A Supabase client for routes that don't require a session at all (e.g.
 * public comment reads, anonymous play-count increments). Still request-
 * scoped so it carries whatever cookies/session *are* present, for RLS. */
export async function publicClient(): Promise<SupabaseClient> {
  return createClient();
}
