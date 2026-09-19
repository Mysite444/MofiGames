import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/route-auth";
import { logSecurityAlertSchema, firstIssueMessage } from "@/lib/validation";

/** POST /api/account/security-event — lets a signed-in user log a
 * password-change or MFA enable/disable event against their own account
 * (RLS only allows this for `auth.uid() = user_id`, see migration 0017).
 * Surfaces on Admin → Security → Alerts. */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const parsed = logSecurityAlertSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  // MED-03 fix: write via log_security_alert_self() SECURITY DEFINER RPC
  // instead of a direct table insert.  The RPC enforces auth.uid() = user_id
  // server-side so users cannot attribute alerts to other accounts, and
  // restricts the callable types to the user-self-service set only.
  const { error } = await supabase.rpc("log_security_alert_self", {
    p_user_id: user.id,
    p_type: parsed.data.type,
    p_message: parsed.data.message,
    p_metadata: {},
  });

  if (error) {
    return NextResponse.json({ error: "Failed to log event." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
