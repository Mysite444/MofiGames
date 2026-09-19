// Shared between the admin client (CacheSecurityAdminClient), the API
// routes under src/app/api/admin/cache/security/**, and middleware.ts: the
// shape of the security_cache_settings row, a pure mapper, and the
// path/cookie-matching + HMAC helpers both sides need to agree on.
//
// Sensitive note: signing_secret is stored in the table but this module
// never sends it anywhere on its own — mapSecurityCacheSettingsRow() below
// requires the caller to have already stripped it (same convention as
// full-page-cache-settings.ts's varnish_purge_key). middleware.ts never
// reads the secret at all; it calls the verify_cache_signature() Postgres
// function (see migration 0052) instead. Only the admin settings route
// (authenticated, admin-only) ever touches the plaintext value, to mint new
// signed URLs/cookies.

export interface SecurityCacheSettings {
  // 1. Do Not Cache Authenticated Pages
  doNotCacheAuthenticated: boolean;
  authCookieNames: string[];

  // 2. Separate Guest and Logged-in User Caches
  separateGuestLoggedInCache: boolean;
  sendVaryCookieHeader: boolean;

  // 3. CSRF-Safe Caching
  csrfSafeCachingEnabled: boolean;
  /** Always true — surfaced so the UI can show it as a locked, always-on
   * row rather than silently doing something the screen never mentions. */
  blockStateChangingMethods: boolean;

  // 4. Cookie-Aware Cache Rules
  cookieAwareRulesEnabled: boolean;
  bypassCookieNames: string[];
  bypassQueryParams: string[];

  // 5. Cache Bypass for Admin, Login, and User Account Pages
  bypassPaths: string[];

  // 6. Signed URLs / Signed Cookies (optional)
  signedUrlsEnabled: boolean;
  signedCookiesEnabled: boolean;
  /** Whether a signing secret is stored. The secret itself never reaches
   * the browser — only this flag + a short preview. */
  signingSecretSet: boolean;
  signingSecretPreview: string | null;
  signedUrlTtlSeconds: number;
  signedUrlParamName: string;
  signedUrlExpiresParamName: string;
  signedCookieName: string;
  signedProtectedPaths: string[];

  updatedAt: string;
}

/** Path prefixes the admin UI always shows and never lets the admin
 * remove — mirrors excludedPaths' `fixed` treatment in
 * CacheFullPageAdminClient. Enforced client-side only; the DB column can
 * technically hold a shorter list, but the settings route always writes
 * these back in on every save (see route.ts). */
export const FIXED_BYPASS_PATHS = ["/admin/*", "/api/admin/*", "/login", "/auth/*", "/account/*"] as const;

export const DEFAULT_SECURITY_CACHE_SETTINGS: SecurityCacheSettings = {
  doNotCacheAuthenticated: true,
  authCookieNames: [
    "sb-access-token",
    "sb-refresh-token",
    "__Secure-next-auth.session-token",
    "next-auth.session-token",
  ],

  separateGuestLoggedInCache: true,
  sendVaryCookieHeader: true,

  csrfSafeCachingEnabled: true,
  blockStateChangingMethods: true,

  cookieAwareRulesEnabled: true,
  bypassCookieNames: [
    "sb-access-token",
    "sb-refresh-token",
    "__Secure-next-auth.session-token",
    "next-auth.session-token",
    "impersonate_user",
    "preview_session",
  ],
  bypassQueryParams: ["preview", "nocache", "impersonate"],

  bypassPaths: ["/admin/*", "/api/admin/*", "/login", "/signup", "/auth/*", "/account/*", "/api/auth/*", "/reset-password"],

  signedUrlsEnabled: false,
  signedCookiesEnabled: false,
  signingSecretSet: false,
  signingSecretPreview: null,
  signedUrlTtlSeconds: 3600,
  signedUrlParamName: "sig",
  signedUrlExpiresParamName: "exp",
  signedCookieName: "__cache_sig",
  signedProtectedPaths: [],

  updatedAt: new Date(0).toISOString(),
};

/** Redact the signing secret the same way full-page-cache-settings.ts
 * redacts the Varnish purge key — only a boolean + last-4-chars preview
 * goes to the browser. */
export function redactSigningSecret(secret: string | null | undefined): {
  signingSecretSet: boolean;
  signingSecretPreview: string | null;
} {
  if (!secret) return { signingSecretSet: false, signingSecretPreview: null };
  return {
    signingSecretSet: true,
    signingSecretPreview: secret.length > 4 ? `…${secret.slice(-4)}` : "…",
  };
}

/** Maps the snake_case DB row to the camelCase SecurityCacheSettings shape.
 * Called by route handlers AFTER stripping the raw signing_secret — the row
 * passed in here must already have it replaced with signing_secret_set /
 * signing_secret_preview. */
export function mapSecurityCacheSettingsRow(row: Record<string, unknown> | null): SecurityCacheSettings {
  if (!row) return DEFAULT_SECURITY_CACHE_SETTINGS;

  return {
    doNotCacheAuthenticated: Boolean(row.do_not_cache_authenticated ?? true),
    authCookieNames: Array.isArray(row.auth_cookie_names)
      ? row.auth_cookie_names.map(String)
      : DEFAULT_SECURITY_CACHE_SETTINGS.authCookieNames,

    separateGuestLoggedInCache: Boolean(row.separate_guest_logged_in_cache ?? true),
    sendVaryCookieHeader: Boolean(row.send_vary_cookie_header ?? true),

    csrfSafeCachingEnabled: Boolean(row.csrf_safe_caching_enabled ?? true),
    blockStateChangingMethods: Boolean(row.block_state_changing_methods ?? true),

    cookieAwareRulesEnabled: Boolean(row.cookie_aware_rules_enabled ?? true),
    bypassCookieNames: Array.isArray(row.bypass_cookie_names)
      ? row.bypass_cookie_names.map(String)
      : DEFAULT_SECURITY_CACHE_SETTINGS.bypassCookieNames,
    bypassQueryParams: Array.isArray(row.bypass_query_params)
      ? row.bypass_query_params.map(String)
      : DEFAULT_SECURITY_CACHE_SETTINGS.bypassQueryParams,

    bypassPaths: Array.isArray(row.bypass_paths)
      ? row.bypass_paths.map(String)
      : DEFAULT_SECURITY_CACHE_SETTINGS.bypassPaths,

    signedUrlsEnabled: Boolean(row.signed_urls_enabled ?? false),
    signedCookiesEnabled: Boolean(row.signed_cookies_enabled ?? false),
    signingSecretSet: Boolean(row.signing_secret_set ?? false),
    signingSecretPreview: row.signing_secret_preview ? String(row.signing_secret_preview) : null,
    signedUrlTtlSeconds: Number(row.signed_url_ttl_seconds ?? 3600),
    signedUrlParamName: String(row.signed_url_param_name ?? "sig"),
    signedUrlExpiresParamName: String(row.signed_url_expires_param_name ?? "exp"),
    signedCookieName: String(row.signed_cookie_name ?? "__cache_sig"),
    signedProtectedPaths: Array.isArray(row.signed_protected_paths)
      ? row.signed_protected_paths.map(String)
      : [],

    updatedAt: String(row.updated_at ?? DEFAULT_SECURITY_CACHE_SETTINGS.updatedAt),
  };
}

// ── Middleware-facing policy shape ──────────────────────────────────────────
// get_security_cache_policy() (migration 0052) returns exactly this shape as
// jsonb — every SecurityCacheSettings field except the signing secret and
// its redacted set/preview companions, which middleware never needs.

export type SecurityCachePolicy = Omit<
  SecurityCacheSettings,
  "signingSecretSet" | "signingSecretPreview" | "updatedAt"
>;

export const DEFAULT_SECURITY_CACHE_POLICY: SecurityCachePolicy = (() => {
  const { signingSecretSet: _s, signingSecretPreview: _p, updatedAt: _u, ...policy } = DEFAULT_SECURITY_CACHE_SETTINGS;
  return policy;
})();

/** Normalizes the jsonb payload from get_security_cache_policy() — same
 * fail-soft shape-guarding as mapSecurityCacheSettingsRow() above, since
 * this is read over an unauthenticated REST call in middleware.ts and a
 * malformed/absent response must never crash request handling. */
export function normalizeSecurityCachePolicy(raw: unknown): SecurityCachePolicy {
  if (!raw || typeof raw !== "object") return DEFAULT_SECURITY_CACHE_POLICY;
  const row = raw as Record<string, unknown>;
  const arr = (v: unknown, fallback: string[]) => (Array.isArray(v) ? v.map(String) : fallback);

  return {
    doNotCacheAuthenticated: Boolean(row.doNotCacheAuthenticated ?? true),
    authCookieNames: arr(row.authCookieNames, DEFAULT_SECURITY_CACHE_POLICY.authCookieNames),
    separateGuestLoggedInCache: Boolean(row.separateGuestLoggedInCache ?? true),
    sendVaryCookieHeader: Boolean(row.sendVaryCookieHeader ?? true),
    csrfSafeCachingEnabled: Boolean(row.csrfSafeCachingEnabled ?? true),
    blockStateChangingMethods: Boolean(row.blockStateChangingMethods ?? true),
    cookieAwareRulesEnabled: Boolean(row.cookieAwareRulesEnabled ?? true),
    bypassCookieNames: arr(row.bypassCookieNames, DEFAULT_SECURITY_CACHE_POLICY.bypassCookieNames),
    bypassQueryParams: arr(row.bypassQueryParams, DEFAULT_SECURITY_CACHE_POLICY.bypassQueryParams),
    bypassPaths: arr(row.bypassPaths, DEFAULT_SECURITY_CACHE_POLICY.bypassPaths),
    signedUrlsEnabled: Boolean(row.signedUrlsEnabled ?? false),
    signedCookiesEnabled: Boolean(row.signedCookiesEnabled ?? false),
    signedUrlTtlSeconds: Number(row.signedUrlTtlSeconds ?? 3600),
    signedUrlParamName: String(row.signedUrlParamName ?? "sig"),
    signedUrlExpiresParamName: String(row.signedUrlExpiresParamName ?? "exp"),
    signedCookieName: String(row.signedCookieName ?? "__cache_sig"),
    signedProtectedPaths: arr(row.signedProtectedPaths, []),
  };
}

// ── Path / cookie matching ──────────────────────────────────────────────────
// Pure, dependency-free — safe to import from middleware.ts (edge runtime),
// API routes (Node runtime), and the admin client (browser) alike.

/** Matches a pathname against one bypass-path pattern. A trailing "/*"
 * means "this segment or anything below it" (so "/admin/*" matches both
 * "/admin" and "/admin/games"); a trailing "*" with no slash means a plain
 * prefix match; anything else is an exact match. */
export function matchesPathPattern(pathname: string, pattern: string): boolean {
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -2);
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  }
  if (pattern.endsWith("*")) {
    return pathname.startsWith(pattern.slice(0, -1));
  }
  return pathname === pattern;
}

export function matchesAnyPathPattern(pathname: string, patterns: string[]): boolean {
  return patterns.some((p) => matchesPathPattern(pathname, p));
}

// ── The actual decision ─────────────────────────────────────────────────────
// One pure function, callable from middleware.ts (edge) or a test (Node) —
// given the live policy and one request's details, decides whether the
// response must be forced private/no-store and whether to emit
// Vary: Cookie. Kept separate from middleware.ts itself so it has no
// dependency on NextRequest and can be unit-tested directly.

export type CacheBypassReason =
  | "state-changing-method"
  | "bypass-path"
  | "bypass-cookie"
  | "bypass-query-param"
  | "authenticated"
  | null;

export interface CacheDecision {
  /** true = force Cache-Control: private, no-store, regardless of what any
   * other cache layer (Full Page Cache, CDN, browser) was told to do. */
  bypass: boolean;
  reason: CacheBypassReason;
  /** Whether to append Vary: Cookie to a cacheable response, per feature 2
   * (Separate Guest and Logged-in User Caches). Always false when bypass
   * is true — a no-store response has nothing to vary. */
  varyCookie: boolean;
}

export function computeCacheDecision(params: {
  policy: SecurityCachePolicy;
  pathname: string;
  method: string;
  /** Cookie names present on the incoming request — not values, names
   * only. Presence is all any of these checks need. */
  cookieNames: string[];
  searchParams: URLSearchParams;
}): CacheDecision {
  const { policy, pathname, method, cookieNames, searchParams } = params;
  const has = (name: string) => cookieNames.includes(name);

  // 3. CSRF-Safe Caching — a state-changing method is never cacheable,
  // independent of every other rule below.
  if (policy.csrfSafeCachingEnabled && policy.blockStateChangingMethods && !["GET", "HEAD"].includes(method)) {
    return { bypass: true, reason: "state-changing-method", varyCookie: false };
  }

  // 5. Cache Bypass for Admin, Login, and User Account Pages.
  if (matchesAnyPathPattern(pathname, policy.bypassPaths)) {
    return { bypass: true, reason: "bypass-path", varyCookie: false };
  }

  // 4. Cookie-Aware Cache Rules.
  if (policy.cookieAwareRulesEnabled && policy.bypassCookieNames.some(has)) {
    return { bypass: true, reason: "bypass-cookie", varyCookie: false };
  }
  if (policy.bypassQueryParams.some((p) => searchParams.has(p))) {
    return { bypass: true, reason: "bypass-query-param", varyCookie: false };
  }

  // 1. Do Not Cache Authenticated Pages.
  if (policy.doNotCacheAuthenticated && policy.authCookieNames.some(has)) {
    return { bypass: true, reason: "authenticated", varyCookie: false };
  }

  // 2. Separate Guest and Logged-in User Caches — only relevant once we've
  // decided the response IS cacheable (if doNotCacheAuthenticated is off,
  // an authenticated response can still reach here, hence Vary: Cookie
  // still matters even though bypass is false).
  const varyCookie = policy.separateGuestLoggedInCache && policy.sendVaryCookieHeader;
  return { bypass: false, reason: null, varyCookie };
}

// ── HMAC signing (Web Crypto — works in both Node ≥ 18 and the Edge
// runtime, unlike node:crypto which the rest of this app's secrets
// (api-keys.ts, backup-crypto.ts) use but which middleware.ts can't
// import) ────────────────────────────────────────────────────────────────

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const digest = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Signature payload is always `${path}.${expiresAtUnixSeconds}` — must
 * match verify_cache_signature()'s `p_path || '.' || p_exp::text` exactly
 * (see migration 0052) since Postgres computes the same HMAC to verify. */
function signaturePayload(path: string, expiresAt: number): string {
  return `${path}.${expiresAt}`;
}

export interface SignedUrlResult {
  url: string;
  path: string;
  expiresAt: number;
  signature: string;
}

/** Builds `${baseUrl}${path}?${paramName}=<sig>&${expParamName}=<exp>` —
 * used by the admin "Generate test signed URL" tool. baseUrl should be the
 * site origin with no trailing slash; path must start with "/". */
export async function generateSignedUrl(
  baseUrl: string,
  path: string,
  secret: string,
  ttlSeconds: number,
  paramName: string,
  expParamName: string
): Promise<SignedUrlResult> {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const signature = await hmacSha256Hex(secret, signaturePayload(path, expiresAt));
  const url = new URL(path, baseUrl);
  url.searchParams.set(paramName, signature);
  url.searchParams.set(expParamName, String(expiresAt));
  return { url: url.toString(), path, expiresAt, signature };
}

/** Builds the signed cookie value `${path}|${expiresAt}|${signature}` — the
 * path is embedded in the value itself (rather than relied on purely via
 * the cookie's own Path attribute) so a cookie minted for one path can't
 * be replayed against another even if something upstream forwards it
 * broadly. */
export async function generateSignedCookieValue(
  path: string,
  secret: string,
  ttlSeconds: number
): Promise<{ value: string; expiresAt: number }> {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const signature = await hmacSha256Hex(secret, signaturePayload(path, expiresAt));
  return { value: `${path}|${expiresAt}|${signature}`, expiresAt };
}

