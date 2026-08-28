import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff, requireAdmin } from "@/lib/supabase/route-auth";
import { updateUserRoleSchema, firstIssueMessage } from "@/lib/validation";
import { enrichWithAuthData, logUserActivity } from "@/lib/supabase/user-admin-helpers";
import { apiError } from "@/lib/api-error";

const paramsSchema = z.object({ id: z.string().uuid() });

/** GET /api/admin/users/:id — full detail for one user (profile, ban/
 * verification state, and auth metadata when the service-role key is
 * configured). Any staff role can view. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  const auth = await requireStaff();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", parsedParams.data.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to load user." }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const authData = await enrichWithAuthData([parsedParams.data.id]);

  return NextResponse.json({ user: { ...profile, auth: authData.get(parsedParams.data.id) ?? null } });
}

/** PATCH /api/admin/users/:id — currently only changes `role`. Deliberately
 * admin-only: role assignment (including granting moderator/editor in the
 * first place) is the one User Management action that is never permission-
 * configurable, so it can't be delegated away by mistake. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  const auth = await requireAdmin();
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

  const parsed = updateUserRoleSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { data: before } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", parsedParams.data.id)
    .maybeSingle();

  const { data: updated, error } = await supabase
    .from("profiles")
    .update({ role: parsed.data.role })
    .eq("id", parsedParams.data.id)
    .select()
    .single();

  if (error) {
    return apiError(error);
  }

  await logUserActivity(supabase, {
    userId: parsedParams.data.id,
    activityType: "role_changed",
    description: `Role changed from ${before?.role ?? "user"} to ${parsed.data.role}`,
    metadata: { from: before?.role ?? "user", to: parsed.data.role },
    actorId: user.id,
  });

  return NextResponse.json({ user: updated });
}
