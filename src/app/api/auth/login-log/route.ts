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

  // HIGH-01 fix: write via record_login_attempt() SECURITY DEFINER RPC
  // instead of a direct table insert.  The RPC applies a per-IP insert cap
  // so a single IP cannot manufacture lockouts for arbitrary emails by
  // posting directly to the Supabase REST API.
  await supabase.rpc("record_login_attempt", {
    p_email: email,
    p_user_id: user?.id ?? null,
    p_success: success,
    p_failure_reason: success ? null : (failureReason ?? "invalid_credentials"),
    p_ip: ip ?? null,
    p_user_agent: userAgent ?? null,
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
    // MED-03 fix: write via log_security_alert_internal() SECURITY DEFINER
    // RPC instead of a direct table insert so the security_alerts table
    // cannot be written to directly by an unauthenticated client.
    if ((failureCount ?? 0) === settings.maxFailedAttempts) {
      await supabase.rpc("log_security_alert_internal", {
        p_type: "account_lockout",
        p_severity: "warning",
        p_user_id: null,
        p_message: `${email} was locked out after ${settings.maxFailedAttempts} failed login attempts.`,
        p_metadata: { email, ip },
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
    // MED-03 fix: same RPC pattern as above.
    if ((seenFromIp ?? 0) <= 1) {
      await supabase.rpc("log_security_alert_internal", {
        p_type: "new_login",
        p_severity: "info",
        p_user_id: user.id,
        p_message: `New login for ${email} from a previously unseen IP address.`,
        p_metadata: { email, ip, userAgent },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
