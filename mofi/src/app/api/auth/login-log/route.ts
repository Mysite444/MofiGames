import { NextResponse, type NextRequest } from "next/server";
import { publicClient } from "@/lib/supabase/route-auth";
import { recordLoginAttemptSchema, firstIssueMessage } from "@/lib/validation";
import { DEFAULT_SECURITY_SETTINGS, mapSecuritySettingsRow } from "@/lib/security";
import { clientIp } from "@/lib/request-ip";

/** POST /api/auth/login-log — called by the login form right after every
 * Supabase Auth attempt (success or failure) to record it in
 * `login_attempts` (Admin → Security → Login Logs) and, when relevant,
 * raise a `security_alerts` entry. Best-effort throughout: a logging
 * failure here should never surface as a login failure to the person
 * signing in.
 *
 * Counts are read via SECURITY DEFINER RPCs (count_recent_login_failures,
 * count_successful_logins_from_ip — migration 0018), not a direct table
 * select: login_attempts itself is staff-only to read, so an anon select
 * here would always come back empty. */
export async function POST(request: NextRequest) {
  const parsed = recordLoginAttemptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const { email, success, failureReason } = parsed.data;

  const supabase = await publicClient();
  const ip = clientIp(request);
  const userAgent = request.headers.get("user-agent");

  // The login route only ever calls this once a session may already
  // exist (success case) — read the just-created session to attribute
  // the row to a user id, rather than trusting anything from the client.
  const {
    data: { user },
  } = success ? await supabase.auth.getUser() : { data: { user: null } };

  await supabase.from("login_attempts").insert({
    email,
    user_id: user?.id ?? null,
    success,
    failure_reason: success ? null : failureReason ?? "invalid_credentials",
    ip,
    user_agent: userAgent,
  });

  if (!success) {
    const { data: settingsRow } = await supabase.from("security_settings").select("*").eq("id", true).maybeSingle();
    const settings = settingsRow ? mapSecuritySettingsRow(settingsRow) : DEFAULT_SECURITY_SETTINGS;

    const { data: failureCount } = await supabase.rpc("count_recent_login_failures", {
      p_email: email,
      p_window_minutes: settings.lockoutWindowMinutes,
    });

    // Only raise the alert on the attempt that actually crosses the
    // threshold, not on every subsequent attempt while still locked.
    if ((failureCount ?? 0) === settings.maxFailedAttempts) {
      await supabase.from("security_alerts").insert({
        type: "account_lockout",
        severity: "warning",
        message: `${email} was locked out after ${settings.maxFailedAttempts} failed login attempts.`,
        metadata: { email, ip },
      });
    }
    return NextResponse.json({ ok: true });
  }

  // Best-effort "new login" signal: has this email ever signed in
  // successfully from this IP before? A missing/empty IP is skipped
  // entirely (nothing meaningful to compare).
  if (ip && user) {
    const { data: seenFromIp } = await supabase.rpc("count_successful_logins_from_ip", {
      p_email: email,
      p_ip: ip,
    });

    // 1 at this point means the row just inserted above is the only match.
    if ((seenFromIp ?? 0) <= 1) {
      await supabase.from("security_alerts").insert({
        type: "new_login",
        severity: "info",
        user_id: user.id,
        message: `New login for ${email} from a previously unseen IP address.`,
        metadata: { email, ip, userAgent },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
