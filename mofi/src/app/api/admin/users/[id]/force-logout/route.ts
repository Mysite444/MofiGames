import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { getServiceRoleClient } from "@/lib/supabase/admin-client";
import { logUserActivity } from "@/lib/supabase/user-admin-helpers";
import { apiError } from "@/lib/api-error";

const paramsSchema = z.object({ id: z.string().uuid() });

/** POST /api/admin/users/:id/force-logout — revokes every active session
 * for this user, everywhere, immediately. Admin-only (this is a strong
 * action) and requires SUPABASE_SERVICE_ROLE_KEY — there's no way to
 * revoke someone else's refresh tokens without the Admin API. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Session management needs a Supabase Service Role Key configured on the server first." },
      { status: 501 }
    );
  }

  const { error } = await admin.auth.admin.signOut(parsedParams.data.id, "global");
  if (error) {
    return apiError(error);
  }

  await logUserActivity(supabase, {
    userId: parsedParams.data.id,
    activityType: "force_logout",
    actorId: user.id,
  });

  return NextResponse.json({ ok: true });
}
