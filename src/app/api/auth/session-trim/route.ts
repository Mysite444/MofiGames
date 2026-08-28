import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_SECURITY_SETTINGS, mapSecuritySettingsRow } from "@/lib/security";
import { publicClient } from "@/lib/supabase/route-auth";

/**
 * POST /api/auth/session-trim
 *
 * Called by the login form immediately after a successful Supabase sign-in
 * when the user did NOT tick "Remember me".  Supabase SSR's default is to
 * write a refresh-token cookie that lasts roughly one year.  This endpoint
 * rewrites every sb-* auth cookie in the response with a MaxAge equal to
 * security_settings.session_timeout_minutes (default 60 minutes), turning
 * them into short-lived session cookies that expire once the browser closes
 * or after the configured timeout — whichever comes first.
 *
 * When "Remember me" IS ticked, the client simply never calls this route and
 * Supabase's long-lived default stands.
 *
 * Security notes:
 *  - SameSite=Lax and Secure (production) are enforced on every rewritten
 *    cookie, matching the hardening in server.ts and middleware.ts.
 *  - The route never touches cookie values — only the MaxAge attribute.
 *  - A missing or broken security_settings row falls back to 60 minutes so
 *    this route always produces a bounded session rather than an open one.
 */
export async function POST(request: NextRequest) {
  // Resolve the configured timeout (falls back to 60 min on any error).
  let timeoutMinutes = DEFAULT_SECURITY_SETTINGS.sessionTimeoutMinutes;
  try {
    const supabase = await publicClient();
    const { data: settingsRow } = await supabase
      .from("security_settings")
      .select("session_timeout_minutes")
      .eq("id", true)
      .maybeSingle();
    if (settingsRow) {
      const mapped = mapSecuritySettingsRow(settingsRow as Record<string, unknown>);
      timeoutMinutes = mapped.sessionTimeoutMinutes;
    }
  } catch {
    // Fail safe: keep the default.
  }

  const maxAge = timeoutMinutes * 60; // seconds
  const isProduction = process.env.NODE_ENV === "production";

  const response = NextResponse.json({ ok: true });

  // Rewrite every Supabase auth cookie (all start with "sb-") that is present
  // on the incoming request.  We only change MaxAge; values are left intact.
  for (const cookie of request.cookies.getAll()) {
    if (!cookie.name.startsWith("sb-")) continue;
    response.cookies.set(cookie.name, cookie.value, {
      httpOnly: false,   // Must remain readable by the Supabase JS client
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge,            // <-- The whole point: cap the lifetime
    });
  }

  return response;
}
