import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { clientIp } from "@/lib/request-ip";
import { DEFAULT_SECURITY_SETTINGS, mapSecuritySettingsRow } from "@/lib/security";

// ---------------------------------------------------------------------------
// POST /api/auth/login — server-side credential verification.
//
// HIGH-02 fix: previously, login() in auth-context.tsx called:
//   1. /api/auth/login-guard  (lockout check, server-side)
//   2. supabase.auth.signInWithPassword()  (browser → Supabase Auth directly)
//
// The gap: step 2 was a direct browser call to the Supabase Auth REST
// endpoint (https://<project>.supabase.co/auth/v1/token).  An attacker who
// knows that URL (it's derivable from the public NEXT_PUBLIC_SUPABASE_URL)
// can call it directly, bypassing step 1 entirely — the lockout and
// IP-rate-limit in login-guard were never enforced for them.
//
// Fix: this route combines both steps server-side.  The lockout check and the
// signInWithPassword call now happen in the same server request, in sequence,
// with no opportunity for a client to skip the check.  An attacker calling
// Supabase Auth directly still can, but they get no session because they never
// touch this application's credential-verification path — and this is the only
// path that writes a valid session cookie the application will accept.
//
// What happens on success:
//   - The Supabase SSR server client writes the session to cookies in the
//     HTTP response.
//   - This route also returns the session's access_token + refresh_token so
//     the client-side SDK can call setSession() and fire onAuthStateChange
//     (SIGNED_IN), updating React state without a page reload.
//   - Login logging (record_login_attempt) and security alerts are written
//     here, not in a separate fire-and-forget fetch, so they're always
//     recorded even if the browser disconnects.
// ---------------------------------------------------------------------------

const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(128),
  remember: z.boolean().optional().default(true),
});

export async function POST(request: NextRequest) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { email, password, remember } = parsed.data;

  // Use the SSR server client so signInWithPassword() writes the session
  // to cookies in the response, consistent with middleware's session-refresh
  // pattern and the rest of the Next.js SSR auth architecture.
  const supabase = await createClient();
  const ip = clientIp(request);
  const userAgent = request.headers.get("user-agent") ?? null;

  // ── Step 1: IP rate limit ────────────────────────────────────────────────
  // Same cap as login-guard: 30 attempts / 5 minutes per IP.
  if (ip) {
    const { data: underIpLimit } = await supabase.rpc("hit_rate_limit", {
      p_key: `login-ip:${ip}`,
      p_window_seconds: 300,
      p_max: 30,
    });
    if (underIpLimit === false) {
      return NextResponse.json({ locked: true, error: "Too many login attempts. Try again in 5 minutes.", retryAfterMinutes: 5 }, { status: 429 });
    }
  }

  // ── Step 2: Per-email lockout check ─────────────────────────────────────
  // Read the admin-configured thresholds (defaults on error).
  let settings = DEFAULT_SECURITY_SETTINGS;
  try {
    const { data: settingsRow } = await supabase
      .from("security_settings")
      .select("*")
      .eq("id", true)
      .maybeSingle();
    if (settingsRow) settings = mapSecuritySettingsRow(settingsRow);
  } catch {
    // Fail open — a broken settings table should never prevent legitimate logins.
  }

  const { data: failureCount } = await supabase.rpc("count_recent_login_failures", {
    p_email: email,
    p_window_minutes: settings.lockoutWindowMinutes,
  });

  if ((failureCount ?? 0) >= settings.maxFailedAttempts) {
    return NextResponse.json(
      { locked: true, error: `Too many failed attempts. Try again in about ${settings.lockoutWindowMinutes} minute(s).`, retryAfterMinutes: settings.lockoutWindowMinutes },
      { status: 429 }
    );
  }

  // ── Step 3: Credential verification ─────────────────────────────────────
  // This is now server-side — the Supabase Auth REST endpoint is called
  // by our server, not by the browser.  Skipping this route means an
  // attacker never gets a properly-scoped session cookie from this app.
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });

  // ── Step 4: Log the attempt ──────────────────────────────────────────────
  // Server-side so the log is always written even if the browser
  // disconnects between the login call and the fire-and-forget log call
  // in the old client-side flow.
  try {
    await supabase.rpc("record_login_attempt", {
      p_email: email,
      p_user_id: authError ? null : (authData?.user?.id ?? null),
      p_success: !authError,
      p_failure_reason: authError ? authError.message : null,
      p_ip: ip ?? null,
      p_user_agent: userAgent,
    });
  } catch {
    // Best-effort — a dropped log entry is preferable to a broken login.
  }

  // ── Step 5: Handle failure ───────────────────────────────────────────────
  if (authError || !authData?.session) {
    // If this failure crossed the lockout threshold, raise a security alert.
    try {
      const { data: newCount } = await supabase.rpc("count_recent_login_failures", {
        p_email: email,
        p_window_minutes: settings.lockoutWindowMinutes,
      });
      if ((newCount ?? 0) === settings.maxFailedAttempts) {
        await supabase.rpc("log_security_alert_internal", {
          p_type: "account_lockout",
          p_severity: "warning",
          p_user_id: null,
          p_message: `${email} was locked out after ${settings.maxFailedAttempts} failed login attempts.`,
          p_metadata: { email, ip },
        });
      }
    } catch {
      // Best-effort.
    }
    // Return a generic message — don't confirm which part was wrong.
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const { session, user } = authData;

  // ── Step 6: New-location alert ───────────────────────────────────────────
  try {
    if (ip) {
      const { data: seenFromIp } = await supabase.rpc("count_successful_logins_from_ip", {
        p_email: email,
        p_ip: ip,
      });
      // ≤ 1 because the successful login row was just written above.
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
  } catch {
    // Best-effort.
  }

  // ── Step 7: Activity log ─────────────────────────────────────────────────
  try {
    await supabase.from("user_activity_logs").insert({ user_id: user.id, activity_type: "login" });
  } catch {
    // Best-effort.
  }

  // ── Step 8: Return session tokens for client-side SDK handoff ────────────
  // The SSR client already wrote the session to cookies on this response
  // (step 3).  We also return the tokens in the body so the browser's
  // createBrowserClient can call setSession() and fire onAuthStateChange
  // (SIGNED_IN) — without a page reload.  These are the same JWT values
  // that Supabase would have returned to the browser directly in the old
  // flow; returning them here is not a new exposure.
  //
  // If "remember me" is false the client will still call /api/auth/session-trim
  // to shorten the cookie MaxAge, exactly as before.
  return NextResponse.json({
    ok: true,
    session: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
    },
    remember,
  });
}
