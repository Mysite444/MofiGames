import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/supabase/route-auth";
import { banUserSchema, firstIssueMessage } from "@/lib/validation";
import { logUserActivity } from "@/lib/supabase/user-admin-helpers";
import { getServiceRoleClient } from "@/lib/supabase/admin-client";
import { apiError } from "@/lib/api-error";

const paramsSchema = z.object({ id: z.string().uuid() });

// A ban with no expiry is stored as ban_expires_at = null (permanent) in
// profiles. Supabase's Admin API ban_duration has no true "forever" value
// — it wants a duration string — so a permanent ban there is represented
// as a very long duration instead. 10 years reads as permanent for any
// practical purpose without the API rejecting it as unparseable.
const PERMANENT_BAN_DURATION = "87600h";

/** POST /api/admin/users/:id/ban — bans a user. Requires ban_users
 * (admins always have it). Always updates profiles.is_banned (enforced by
 * RLS everywhere that matters — comments, ratings, favorites, reports).
 * When a service-role key is configured, also bans at the Supabase Auth
 * level (blocks login entirely, not just writes) and force-revokes any
 * existing session — without one, the person can still browse/log in but
 * every write RLS checks is_banned() on is blocked. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  const auth = await requirePermission("ban_users");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = banUserSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const expiresAt = parsed.data.expiresInDays
    ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const { data: updated, error } = await supabase
    .from("profiles")
    .update({
      is_banned: true,
      ban_reason: parsed.data.reason,
      banned_at: new Date().toISOString(),
      ban_expires_at: expiresAt,
      banned_by: user.id,
    })
    .eq("id", parsedParams.data.id)
    .select()
    .single();

  if (error) {
    return apiError(error);
  }

  const admin = getServiceRoleClient();
  let authLevelBanApplied = false;
  if (admin) {
    try {
      await admin.auth.admin.updateUserById(parsedParams.data.id, {
        ban_duration: parsed.data.expiresInDays ? `${parsed.data.expiresInDays * 24}h` : PERMANENT_BAN_DURATION,
      });
      await admin.auth.admin.signOut(parsedParams.data.id, "global");
      authLevelBanApplied = true;
    } catch {
      // Profile-level ban above still stands even if the Auth-level call
      // fails — degrade to "writes blocked" rather than failing the ban.
    }
  }

  await logUserActivity(supabase, {
    userId: parsedParams.data.id,
    activityType: "banned",
    description: parsed.data.reason,
    metadata: { expiresAt, authLevelBanApplied },
    actorId: user.id,
  });

  return NextResponse.json({ user: updated, authLevelBanApplied });
}

/** DELETE /api/admin/users/:id/ban — unbans a user. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  const auth = await requirePermission("ban_users");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const { data: updated, error } = await supabase
    .from("profiles")
    .update({ is_banned: false, ban_reason: null, banned_at: null, ban_expires_at: null, banned_by: null })
    .eq("id", parsedParams.data.id)
    .select()
    .single();

  if (error) {
    return apiError(error);
  }

  const admin = getServiceRoleClient();
  if (admin) {
    try {
      await admin.auth.admin.updateUserById(parsedParams.data.id, { ban_duration: "none" });
    } catch {
      // Profile-level unban above still stands regardless.
    }
  }

  await logUserActivity(supabase, {
    userId: parsedParams.data.id,
    activityType: "unbanned",
    actorId: user.id,
  });

  return NextResponse.json({ user: updated });
}
