import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { redactSigningSecret, FIXED_BYPASS_PATHS } from "@/lib/security-cache-settings";
import { securityCacheSettingsInputSchema, firstIssueMessage } from "@/lib/validation";

/** GET /api/admin/cache/security/settings — Admin → Cache → Security.
 * Admin-only. Redacts signing_secret to a boolean + preview before the row
 * reaches the browser, exactly as full-page/settings does for the Varnish
 * purge key. Everything else is returned as-is. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from("security_cache_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to load security cache settings." }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ settings: null });
  }

  const { signing_secret, ...rest } = data as Record<string, unknown> & { signing_secret?: string | null };
  const redacted = redactSigningSecret(signing_secret ?? null);

  return NextResponse.json({
    settings: {
      ...rest,
      signing_secret_set: redacted.signingSecretSet,
      signing_secret_preview: redacted.signingSecretPreview,
    },
  });
}

/** PUT /api/admin/cache/security/settings — Admin → Cache → Security.
 * Admin-only. Partial update — only fields present in the body are
 * written. signingSecret blank/omitted = leave the stored secret
 * untouched. clearSigningSecret: true = explicitly wipe it (also turns off
 * signedUrlsEnabled/signedCookiesEnabled, since neither can function
 * without a key). bypassPaths always has FIXED_BYPASS_PATHS merged back in
 * — an admin can add to the bypass list from the UI but the core
 * admin/login/account paths can never be removed via this route. */
export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const parsed = securityCacheSettingsInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const input = parsed.data;

  // A signed-URL/signed-cookie toggle turning on needs a key to actually
  // sign with — either already stored, or arriving in this same request.
  const wantsSignedFeature =
    !input.clearSigningSecret && (input.signedUrlsEnabled === true || input.signedCookiesEnabled === true);
  if (wantsSignedFeature && !input.signingSecret) {
    const { data: existing } = await supabase
      .from("security_cache_settings")
      .select("signing_secret")
      .eq("id", true)
      .maybeSingle();
    if (!(existing as { signing_secret?: string | null } | null)?.signing_secret) {
      return NextResponse.json(
        { error: "Set a signing secret before enabling Signed URLs or Signed Cookies." },
        { status: 400 }
      );
    }
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  };

  // 1. Do Not Cache Authenticated Pages
  if (input.doNotCacheAuthenticated !== undefined) patch.do_not_cache_authenticated = input.doNotCacheAuthenticated;
  if (input.authCookieNames !== undefined) patch.auth_cookie_names = input.authCookieNames;

  // 2. Separate Guest and Logged-in User Caches
  if (input.separateGuestLoggedInCache !== undefined)
    patch.separate_guest_logged_in_cache = input.separateGuestLoggedInCache;
  if (input.sendVaryCookieHeader !== undefined) patch.send_vary_cookie_header = input.sendVaryCookieHeader;

  // 3. CSRF-Safe Caching
  if (input.csrfSafeCachingEnabled !== undefined) patch.csrf_safe_caching_enabled = input.csrfSafeCachingEnabled;
  if (input.blockStateChangingMethods !== undefined)
    patch.block_state_changing_methods = input.blockStateChangingMethods;

  // 4. Cookie-Aware Cache Rules
  if (input.cookieAwareRulesEnabled !== undefined) patch.cookie_aware_rules_enabled = input.cookieAwareRulesEnabled;
  if (input.bypassCookieNames !== undefined) patch.bypass_cookie_names = input.bypassCookieNames;
  if (input.bypassQueryParams !== undefined) patch.bypass_query_params = input.bypassQueryParams;

  // 5. Cache Bypass for Admin, Login, and User Account Pages — fixed core
  // paths are always present, whatever the client sent.
  if (input.bypassPaths !== undefined) {
    patch.bypass_paths = Array.from(new Set([...FIXED_BYPASS_PATHS, ...input.bypassPaths]));
  }

  // 6. Signed URLs / Signed Cookies
  if (input.clearSigningSecret) {
    patch.signing_secret = null;
    patch.signed_urls_enabled = false;
    patch.signed_cookies_enabled = false;
  } else {
    if (input.signingSecret) patch.signing_secret = input.signingSecret; // blank/omitted = unchanged
    if (input.signedUrlsEnabled !== undefined) patch.signed_urls_enabled = input.signedUrlsEnabled;
    if (input.signedCookiesEnabled !== undefined) patch.signed_cookies_enabled = input.signedCookiesEnabled;
  }
  if (input.signedUrlTtlSeconds !== undefined) patch.signed_url_ttl_seconds = input.signedUrlTtlSeconds;
  if (input.signedUrlParamName !== undefined) patch.signed_url_param_name = input.signedUrlParamName;
  if (input.signedUrlExpiresParamName !== undefined)
    patch.signed_url_expires_param_name = input.signedUrlExpiresParamName;
  if (input.signedCookieName !== undefined) patch.signed_cookie_name = input.signedCookieName;
  if (input.signedProtectedPaths !== undefined) patch.signed_protected_paths = input.signedProtectedPaths;

  const { data, error } = await supabase
    .from("security_cache_settings")
    .update(patch)
    .eq("id", true)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update security cache settings." }, { status: 500 });
  }

  const { signing_secret, ...rest } = data as Record<string, unknown> & { signing_secret?: string | null };
  const redacted = redactSigningSecret(signing_secret ?? null);

  return NextResponse.json({
    settings: {
      ...rest,
      signing_secret_set: redacted.signingSecretSet,
      signing_secret_preview: redacted.signingSecretPreview,
    },
  });
}
