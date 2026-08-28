import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/route-auth";
import { getServiceRoleClient } from "@/lib/supabase/admin-client";
import { apiError } from "@/lib/api-error";

/** POST /api/account/force-logout — "Log out of all devices" on your own
 * Profile → Security section. Same underlying Admin API call as the
 * admin-side force-logout (Admin → User Management → Login & Sessions),
 * just self-service and without the admin check. Needs
 * SUPABASE_SERVICE_ROLE_KEY — same graceful-degrade as everywhere else
 * that uses it. */
export async function POST() {
  const auth = await requireUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { user } = auth.ctx;

  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json(
      { error: "This needs a Supabase Service Role Key configured on the server first." },
      { status: 501 }
    );
  }

  const { error } = await admin.auth.admin.signOut(user.id, "global");
  if (error) {
    return apiError(error);
  }

  return NextResponse.json({ ok: true });
}
