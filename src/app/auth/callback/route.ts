import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth/PKCE callback for "Continue with Google" / "Continue with
 * Discord" (LoginPageClient, SignupPageClient) — this is the exact URL
 * those providers redirect back to (see loginWithProvider() in
 * auth-context.tsx, and NEXT_PUBLIC_SITE_URL/<preview-url> + this path
 * must also be added to Supabase → Authentication → URL Configuration →
 * Redirect URLs).
 *
 * Supabase's browser client only starts the OAuth handshake and holds
 * the PKCE code verifier; it never sees the resulting session. That only
 * exists once this route exchanges the one-time `code` Google/Discord
 * hand back for a real session and writes it to cookies, which is why
 * this has to be a server route rather than something handled entirely
 * client-side.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Where to send the browser after a successful sign-in. Deliberately
  // not trusting an arbitrary absolute URL from the query string (open-
  // redirect risk) — only ever a same-app path.
  const nextParam = searchParams.get("next");
  const next = nextParam && nextParam.startsWith("/") ? nextParam : "/profile";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Missing code, or the exchange failed (expired/replayed code, provider
  // denied consent, etc.) — back to the login form with a flag it can
  // show as an error banner rather than a broken redirect.
  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
