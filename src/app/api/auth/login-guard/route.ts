import { NextResponse, type NextRequest } from "next/server";
import { publicClient } from "@/lib/supabase/route-auth";
import { loginGuardQuerySchema, firstIssueMessage } from "@/lib/validation";
import { DEFAULT_SECURITY_SETTINGS, mapSecuritySettingsRow } from "@/lib/security";
import { clientIp } from "@/lib/request-ip";

/** POST /api/auth/login-guard — checked by the login form *before* it
 * calls Supabase Auth, so a locked-out account never even gets to spend
 * an attempt against Supabase (and never leaks via timing whether the
 * password would've been right). "Locked" here is a sliding window: N
 * failed attempts for this email within the last M minutes (see
 * security_settings) — it clears on its own once the oldest of those
 * attempts ages out, nothing to explicitly "unlock".
 *
 * Also rate-limits by IP (30 attempts / 5 minutes, fixed — not tied to
 * any one email) as a credential-stuffing guard: the per-email lockout
 * above doesn't help against someone trying many different emails from
 * one source. */
export async function POST(request: NextRequest) {
  const parsed = loginGuardQuerySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const { email } = parsed.data;

  const supabase = await publicClient();

  const ip = clientIp(request);
  if (ip) {
    const { data: underLimit } = await supabase.rpc("hit_rate_limit", {
      p_key: `login-ip:${ip}`,
      p_window_seconds: 300,
      p_max: 30,
    });
    if (underLimit === false) {
      return NextResponse.json({ locked: true, retryAfterMinutes: 5 });
    }
  }

  const { data: settingsRow } = await supabase.from("security_settings").select("*").eq("id", true).maybeSingle();
  const settings = settingsRow ? mapSecuritySettingsRow(settingsRow) : DEFAULT_SECURITY_SETTINGS;

  // login_attempts itself is staff-only to read (Admin → Security → Login
  // Logs) — this goes through a SECURITY DEFINER counter instead of a
  // direct select, see migration 0018.
  const { data: failureCount, error } = await supabase.rpc("count_recent_login_failures", {
    p_email: email,
    p_window_minutes: settings.lockoutWindowMinutes,
  });

  // Fail open — a broken lockout check should never be the reason a
  // legitimate login can't even be attempted.
  if (error) {
    return NextResponse.json({ locked: false });
  }

  const locked = (failureCount ?? 0) >= settings.maxFailedAttempts;
  return NextResponse.json({
    locked,
    retryAfterMinutes: locked ? settings.lockoutWindowMinutes : undefined,
  });
}
