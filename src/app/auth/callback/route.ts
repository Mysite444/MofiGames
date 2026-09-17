import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth/PKCE callback for "Continue with Google" / "Continue with Discord"
 * (LoginPageClient, SignupPageClient) — this is the exact URL those providers
 * redirect back to after the user grants consent.
 *
 * Supabase's browser client holds the PKCE code verifier; this server route
 * exchanges the one-time `code` for a real session and writes it to cookies.
 *
 * Open-redirect hardening (§23.1, SECURITY_FOLLOWUP.md):
 *   The `next` query parameter tells us where to send the browser after a
 *   successful sign-in.  It must be a same-origin path only.  We validate
 *   this with safeRedirectPath() below, which rejects:
 *     • Absolute URLs  (http://evil.com)
 *     • Protocol-relative URLs  (//evil.com — starts with "/" but is off-origin)
 *     • Any value whose URL-parse result's origin differs from ours
 *   Rejected values fall back to /profile.
 */

/** Returns the path only when it is safe to redirect to within this origin;
 *  returns null for anything that could navigate the browser off-domain. */
function safeRedirectPath(raw: string | null, origin: string): string {
  const fallback = "/profile";
  if (!raw) return fallback;

  // Must start with exactly one "/" — not "//" (protocol-relative).
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;

  // Resolve against our own origin and confirm the resulting URL stays there.
  try {
    const resolved = new URL(raw, origin);
    if (resolved.origin !== origin) return fallback;
    // Return just the path (+ optional query + hash) — never the origin itself.
    return resolved.pathname + resolved.search + resolved.hash || fallback;
  } catch {
    return fallback;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code     = searchParams.get("code");
  const nextPath = safeRedirectPath(searchParams.get("next"), origin);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${nextPath}`);
    }
  }

  // Missing code, or the exchange failed (expired/replayed code, provider
  // denied consent, etc.) — back to the login form with an error flag.
  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
