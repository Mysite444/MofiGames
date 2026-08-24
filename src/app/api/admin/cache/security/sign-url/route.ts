import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { generateSignedUrl, generateSignedCookieValue } from "@/lib/security-cache-settings";
import { securitySignUrlInputSchema, firstIssueMessage } from "@/lib/validation";

interface RawRow {
  signing_secret: string | null;
  signed_url_ttl_seconds: number;
  signed_url_param_name: string;
  signed_url_expires_param_name: string;
  signed_cookie_name: string;
}

/** POST /api/admin/cache/security/sign-url — Admin → Cache → Security →
 * Signed URLs / Signed Cookies → "Generate test signature". Admin-only.
 * Reads the real signing_secret server-side (this route runs with an
 * admin session, so the admin-only RLS policy on security_cache_settings
 * lets it through) and mints either a signed URL or a signed cookie value
 * for the given path — the only place in this app besides the settings
 * route itself that ever touches the plaintext secret. Signature
 * verification for real traffic never happens here; that's
 * verify_cache_signature() in Postgres, called from middleware.ts, which
 * never sees the secret at all. */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const parsed = securitySignUrlInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const { path, kind } = parsed.data;

  const { data, error } = await supabase
    .from("security_cache_settings")
    .select("signing_secret, signed_url_ttl_seconds, signed_url_param_name, signed_url_expires_param_name, signed_cookie_name")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to load security cache settings." }, { status: 500 });
  }
  const row = data as RawRow | null;
  if (!row?.signing_secret) {
    return NextResponse.json(
      { error: "No signing secret is set yet — set one under Signed URLs / Signed Cookies first." },
      { status: 400 }
    );
  }

  const origin = new URL(request.url).origin;

  if (kind === "url") {
    const result = await generateSignedUrl(
      origin,
      path,
      row.signing_secret,
      row.signed_url_ttl_seconds,
      row.signed_url_param_name,
      row.signed_url_expires_param_name
    );
    return NextResponse.json({
      kind: "url",
      url: result.url,
      path: result.path,
      expiresAt: result.expiresAt,
      expiresAtIso: new Date(result.expiresAt * 1000).toISOString(),
    });
  }

  const result = await generateSignedCookieValue(path, row.signing_secret, row.signed_url_ttl_seconds);
  return NextResponse.json({
    kind: "cookie",
    cookieName: row.signed_cookie_name,
    cookieValue: result.value,
    path,
    expiresAt: result.expiresAt,
    expiresAtIso: new Date(result.expiresAt * 1000).toISOString(),
    setCookieExample: `${row.signed_cookie_name}=${result.value}; Path=${path}; Secure; HttpOnly; SameSite=Lax`,
  });
}
