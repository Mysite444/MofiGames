import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/supabase/route-auth";
import { logUserActivity } from "@/lib/supabase/user-admin-helpers";
import { apiError } from "@/lib/api-error";

const paramsSchema = z.object({ id: z.string().uuid() });

/** POST /api/admin/users/:id/verify — grants the verified badge. Requires
 * verify_users (admins always have it). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  const auth = await requirePermission("verify_users");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const { data: updated, error } = await supabase
    .from("profiles")
    .update({ is_verified: true, verified_at: new Date().toISOString(), verified_by: user.id })
    .eq("id", parsedParams.data.id)
    .select()
    .single();

  if (error) {
    return apiError(error);
  }

  await logUserActivity(supabase, {
    userId: parsedParams.data.id,
    activityType: "verified",
    actorId: user.id,
  });

  return NextResponse.json({ user: updated });
}

/** DELETE /api/admin/users/:id/verify — revokes the verified badge. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  const auth = await requirePermission("verify_users");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const { data: updated, error } = await supabase
    .from("profiles")
    .update({ is_verified: false, verified_at: null, verified_by: null })
    .eq("id", parsedParams.data.id)
    .select()
    .single();

  if (error) {
    return apiError(error);
  }

  await logUserActivity(supabase, {
    userId: parsedParams.data.id,
    activityType: "unverified",
    actorId: user.id,
  });

  return NextResponse.json({ user: updated });
}
