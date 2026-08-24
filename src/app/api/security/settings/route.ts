import { NextResponse, type NextRequest } from "next/server";
import { publicClient, requireAdmin } from "@/lib/supabase/route-auth";
import { securitySettingsInputSchema, firstIssueMessage } from "@/lib/validation";
import { logAdminAction } from "@/lib/supabase/admin-action-log";

/** GET /api/security/settings — the password/lockout/session policy row.
 * Deliberately unauthenticated: the signup and reset-password forms need
 * this to show a live "meets requirements" checklist before a session
 * exists. */
export async function GET() {
  const supabase = await publicClient();
  const { data } = await supabase.from("security_settings").select("*").eq("id", true).maybeSingle();
  return NextResponse.json({ settings: data ?? null });
}

/** PUT /api/security/settings — Admin → Security → Settings. Admin-only. */
export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const parsed = securitySettingsInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const input = parsed.data;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: user.id };
  if (input.minPasswordLength !== undefined) patch.min_password_length = input.minPasswordLength;
  if (input.requireUppercase !== undefined) patch.require_uppercase = input.requireUppercase;
  if (input.requireLowercase !== undefined) patch.require_lowercase = input.requireLowercase;
  if (input.requireNumber !== undefined) patch.require_number = input.requireNumber;
  if (input.requireSymbol !== undefined) patch.require_symbol = input.requireSymbol;
  if (input.maxFailedAttempts !== undefined) patch.max_failed_attempts = input.maxFailedAttempts;
  if (input.lockoutWindowMinutes !== undefined) patch.lockout_window_minutes = input.lockoutWindowMinutes;
  if (input.sessionTimeoutMinutes !== undefined) patch.session_timeout_minutes = input.sessionTimeoutMinutes;
  if (input.require2faForAdmins !== undefined) patch.require_2fa_for_admins = input.require2faForAdmins;
  if (input.apiCorsOrigins !== undefined) patch.api_cors_origins = input.apiCorsOrigins;

  const { data, error } = await supabase
    .from("security_settings")
    .update(patch)
    .eq("id", true)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update security settings." }, { status: 500 });
  }

  await logAdminAction(supabase, user, {
    action: "security_settings_updated",
    targetType: "security_settings",
    summary: `Updated security settings (${Object.keys(patch).filter((k) => k !== "updated_at" && k !== "updated_by").join(", ") || "no fields"}).`,
    metadata: patch,
  });

  return NextResponse.json({ settings: data });
}
