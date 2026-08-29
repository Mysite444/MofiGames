import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  computeCacheDecision,
  matchesAnyPathPattern,
  normalizeSecurityCachePolicy,
  type SecurityCachePolicy,
} from "@/lib/security-cache-settings";
import { createTimeoutFetch } from "@/lib/supabase/timeout-fetch";
import { timed } from "@/lib/perf-instrumentation";

// Session refresh below must never be able to take the whole site down.
// A short, middleware-appropriate timeout — this runs on nearly every
// request (see the matcher at the bottom of this file), so it can't wait
// as long as a page-level query might.
const MIDDLEWARE_SUPABASE_TIMEOUT_MS = 4_000;

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// ---------------------------------------------------------------------------
// In-process, short-TTL cache for the four Supabase reads below that used
// to run — uncached, sequentially — on every single request to every page:
// access rules, redirects, DNS-prefetch setting, and the security cache
// policy. None of these four values vary per-request (they're the same
// admin-configured config for every visitor), so re-fetching them fresh on
// every request was pure overhead, not a correctness requirement.
//
// This mirrors the exact same pattern src/lib/fragment-cache.ts already
// uses for its own settings (a short TTL, module/global-scoped, refreshed
// lazily on next access after expiry) — same trade-off, same caveat: this
// is per-instance, not shared across every Vercel edge/serverless instance,
// so a change made in Admin can take up to SETTINGS_CACHE_TTL_MS to reach
// any *other* already-warm instance. 30s is short enough that this is a
// non-issue for how these settings are actually used (security rules,
// redirects, cache headers) and long enough to cut real, repeated
// round-trip latency out of the request path. supabase.auth.getUser()
// below is deliberately NOT cached this way — that one has to reflect the
// current request's actual session, not a shared config value.
const SETTINGS_CACHE_TTL_MS = 30_000;

interface TtlEntry<T> {
  value: T;
  expiresAt: number;
}

interface AccessRuleRow {
  rule_type: "ip" | "country";
  mode: "block" | "allow";
  value: string;
}

interface RedirectRow {
  source_path: string;
  destination_path: string | null;
  redirect_type: 301 | 302 | 307 | 308 | 410;
}

let accessRulesCache: TtlEntry<AccessRuleRow[]> | null = null;
let redirectsCache: TtlEntry<Map<string, RedirectRow>> | null = null;
let dnsPrefetchCache: TtlEntry<boolean> | null = null;
let securityCachePolicyCache: TtlEntry<SecurityCachePolicy> | null = null;

function cached<T>(entry: TtlEntry<T> | null): T | undefined {
  if (!entry || Date.now() >= entry.expiresAt) return undefined;
  return entry.value;
}

/**
 * API route prefixes that must never be reachable from a foreign origin.
 * Any browser request that carries a cross-origin Origin header to one of
 * these paths is rejected with 403 before auth, access-control, session
 * refresh, or redirect logic runs.
 *
 * Why server-side enforcement in addition to browser CORS:
 *  - Browser CORS relies on the browser not reading the response. The
 *    request still completes on the server, running auth checks and DB
 *    queries. For admin routes, we want to abort before any of that work.
 *  - A misconfigured CDN or reverse proxy that strips CORS response headers
 *    would otherwise expose admin data to a cross-origin script even though
 *    the site sends no Access-Control-Allow-Origin header.
 *  - Explicit 403 makes intent clear in access logs: this wasn't a broken
 *    request, it was actively rejected.
 *
 * What this does NOT affect:
 *  - Server-to-server calls (curl, backend services, cron) — they send no
 *    Origin header, so blockCrossOriginOnPrivateApi() returns null and they
 *    pass through to normal auth.
 *  - Same-origin browser calls — the admin panel's client components call
 *    /api/admin/* from the same origin; their Origin header matches
 *    request.nextUrl.origin so they pass through normally.
 *  - /api/v1/* — not in this list. Those routes have an explicit CORS
 *    allowlist managed via Admin → Security → Settings → api_cors_origins,
 *    handled by corsHeaders() in src/lib/api-auth.ts.
 */
const PRIVATE_API_PREFIXES = [
  "/api/admin/",
  "/api/auth/",
  "/api/account/",
  "/api/cron/",
] as const;

/**
 * Rejects cross-origin browser requests to private API routes before any
 * other middleware runs. Returns a 403 NextResponse when the Origin header
 * is present and does not match this site's own origin; returns null
 * (pass-through) otherwise.
 *
 * This guards all HTTP methods, including GET — checkSameOrigin() below
 * already covers state-changing methods (POST/PUT/PATCH/DELETE) on every
 * /api/* route; this function adds server-side enforcement for GET on the
 * subset of routes that should never be cross-origin at all.
 *
 * Security decisions:
 *  - An unparseable Origin header is treated as cross-origin (block). A
 *    well-formed browser always sends a parseable Origin on cross-origin
 *    requests; an unparseable value suggests a non-standard or potentially
 *    hostile client.
 *  - The response deliberately omits Access-Control-Allow-Origin so the
 *    browser's own CORS check also fails, providing two independent layers
 *    of rejection.
 */
function blockCrossOriginOnPrivateApi(request: NextRequest): NextResponse | null {
  const pathname = request.nextUrl.pathname;
  const isPrivate = PRIVATE_API_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );
  if (!isPrivate) return null;

  const origin = request.headers.get("origin");
  // No Origin header → server-to-server call (curl, backend, SSR). Allow.
  if (!origin) return null;

  let requestingOrigin: string;
  try {
    requestingOrigin = new URL(origin).origin;
  } catch {
    // Unparseable Origin — treat as cross-origin and block.
    return NextResponse.json(
      { error: "Cross-origin requests are not permitted on this endpoint." },
      { status: 403 }
    );
  }

  if (requestingOrigin !== request.nextUrl.origin) {
    // Cross-origin browser request to a private route.
    // No Access-Control-Allow-Origin in the response, so the browser's
    // own CORS check also fails — two independent layers of rejection.
    return NextResponse.json(
      { error: "Cross-origin requests are not permitted on this endpoint." },
      { status: 403 }
    );
  }

  return null; // Same-origin — allow through.
}

/**
 * Refreshes the Supabase auth session cookie on every request, and applies
 * (in order): a CORS block for private API routes, IP/country access rules
 * (Admin → Security → Access Control), a same-origin check on
 * state-changing API requests (CSRF protection), then any active Redirect
 * Manager rule (Admin → SEO Management → Redirects) for the request path.
 * Each of these can short-circuit the request before it ever reaches a
 * page or route handler.
 */
export async function middleware(request: NextRequest) {
  const __middlewareStart = process.env.PERF_DEBUG_TTFB === "1" ? performance.now() : 0;
  // CORS — must run first, before auth or session work, so a cross-origin
  // request to a private route is rejected without performing any DB
  // queries or session refreshes on its behalf.
  const corsRejection = blockCrossOriginOnPrivateApi(request);
  if (corsRejection) return corsRejection;

  const blocked = await timed("middleware:applyAccessControl", () => applyAccessControl(request));
  if (blocked) return blocked;

  const csrfRejection = checkSameOrigin(request);
  if (csrfRejection) return csrfRejection;

  const redirected = await timed("middleware:applyRedirect", () => applyRedirect(request));
  if (redirected) return redirected;

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: createTimeoutFetch(MIDDLEWARE_SUPABASE_TIMEOUT_MS) },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, {
              ...options,
              // Enforce consistent security on every auth cookie written by
              // the middleware SSR client.  Secure in production, SameSite=Lax
              // to block cross-site POST while allowing OAuth top-level
              // redirects, Path=/ so the cookie reaches every route.
              secure: process.env.NODE_ENV === "production",
              sameSite: (options?.sameSite as CookieOptions["sameSite"]) ?? "lax",
              path: options?.path ?? "/",
            })
          );
        },
      },
    }
  );

  // Touches the session so expired/near-expiry tokens get refreshed.
  //
  // ANONYMOUS VISITOR SHORT-CIRCUIT:
  //   Supabase's @supabase/ssr auth.getUser() validates the access token
  //   against the Supabase Auth API — a real network round-trip that
  //   adds 100-300ms to EVERY request, even when there is no session to
  //   refresh. For the majority of traffic (anonymous visitors with no
  //   auth cookies), this network call produces no result and can be
  //   skipped entirely. We detect this by checking for the presence of
  //   any Supabase session cookie (sb-*-auth-token, or chunked variants
  //   sb-*-auth-token.0 / .1 / etc.) before deciding whether to call
  //   auth.getUser() at all. If there's no token cookie, there's nothing
  //   to validate or refresh, and we skip the round-trip completely.
  //
  // SAFETY:
  //   - Anonymous visitors are still anonymous after this: no cookies are
  //     written and no session is created (same as before this change).
  //   - Signed-in users still have their session refreshed on every
  //     request (the if-branch below runs for them as before).
  //   - The supabase SSR client's setAll() still writes new cookies to the
  //     response when the branch runs and getUser() refreshes a token —
  //     the response object reference is correctly captured.
  //
  // This is the single highest-ROI change in this entire file.
  const hasAuthCookies = request.cookies.getAll().some(
    (c) => c.name.startsWith("sb-") && c.name.includes("-auth-token")
  );
  if (hasAuthCookies) {
    // Signed-in visitor (or a returning user with a near-expiry token).
    // Validate + refresh the session as before. Fail open so a Supabase
    // Auth outage treats the visitor as signed-out for this request rather
    // than crashing every page on the site.
    try {
      await timed("middleware:auth.getUser", () => supabase.auth.getUser());
    } catch (err) {
      console.error("[middleware] Supabase session refresh failed — continuing without it:", err);
    }
  }

  // applyDnsPrefetchControlHeader and applySecurityCacheHeaders are
  // completely independent — they both read their own in-process caches
  // and write distinct headers onto `response`. Running them in parallel
  // saves one sequential async step on every request; the saving is
  // small on cache-warm paths (both finish in <1ms from the module-level
  // caches above) but meaningful on cache-cold paths where each may hit
  // Supabase (~50-150ms each).
  await Promise.all([
    timed("middleware:applyDnsPrefetchControlHeader", () => applyDnsPrefetchControlHeader(request, response)),
    timed("middleware:applySecurityCacheHeaders", () => applySecurityCacheHeaders(request, response)),
  ]);

  if (process.env.PERF_DEBUG_TTFB === "1") {
    console.log(`[perf] middleware:total: ${(performance.now() - __middlewareStart).toFixed(1)}ms`);
  }

  return response;
}

/**
 * Sets the X-DNS-Prefetch-Control response header from
 * dns_prefetch_settings (Admin → Cache → DNS Cache → Browser DNS
 * Cache). Most browsers already default this to "on" for top-level
 * navigations, so the header mainly matters for explicitly opting a
 * response *out* (dnsPrefetchControlEnabled: false) — e.g. a
 * privacy-sensitive page the admin doesn't want pre-resolving
 * third-party hosts for. Skipped for /api and /_next — this is a
 * browser-navigation hint, not something an API response needs — and
 * fails open (defaults to "on", the browser's own default) on any
 * error, same as applyAccessControl/applyRedirect above.
 */
async function applyDnsPrefetchControlHeader(request: NextRequest, response: NextResponse): Promise<void> {
  if (request.nextUrl.pathname.startsWith("/api/") || request.nextUrl.pathname.startsWith("/_next")) return;

  try {
    const cachedValue = cached(dnsPrefetchCache);
    if (cachedValue !== undefined) {
      response.headers.set("X-DNS-Prefetch-Control", cachedValue ? "on" : "off");
      return;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) return;

    const res = await fetch(
      `${supabaseUrl}/rest/v1/dns_prefetch_settings?id=eq.true&select=dns_prefetch_control_enabled`,
      { headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` }, cache: "no-store" }
    );
    if (!res.ok) return;

    const rows = (await res.json()) as { dns_prefetch_control_enabled: boolean }[];
    const enabled = rows[0]?.dns_prefetch_control_enabled ?? true;
    dnsPrefetchCache = { value: enabled, expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS };
    response.headers.set("X-DNS-Prefetch-Control", enabled ? "on" : "off");
  } catch {
    // Fail open — a broken lookup should never block the response.
  }
}

/**
 * Enforces Admin → Cache → Security (Security-Aware Caching, see
 * security_cache_settings + get_security_cache_policy()/
 * verify_cache_signature() in migration 0052). This is the one cache admin
 * page whose settings this app enforces itself, live, on every response —
 * everywhere else (Full Page Cache, CDN, Object Cache, ...) mainly
 * generates config for an external layer. Six things, in order:
 *
 *   1. Do Not Cache Authenticated Pages / 4. Cookie-Aware Cache Rules /
 *      5. Cache Bypass for Admin, Login, and User Account Pages / 3.
 *      CSRF-Safe Caching — computeCacheDecision() (pure, unit-testable,
 *      see security-cache-settings.ts) decides in one pass whether this
 *      response must be forced private/no-store, and why.
 *   2. Separate Guest and Logged-in User Caches — when the response IS
 *      cacheable, Vary: Cookie is appended so any shared cache in front of
 *      this app keeps guest and authenticated variants apart.
 *   6. Signed URLs / Signed Cookies (optional) — only checked when the
 *      path actually falls under signedProtectedPaths (empty by default,
 *      so this costs nothing for the common case). A missing/invalid
 *      signature on a protected path forces no-store; it does not block
 *      the request itself — this feature governs what may be cached at
 *      the edge, not who may view the page. Verification happens entirely
 *      in Postgres via verify_cache_signature(); the signing secret is
 *      never read here.
 *
 * Always sets X-Cache-Security so Admin → Cache → Security → "Live header
 * check" (and anyone curling the site) can see exactly which rule fired.
 * Skipped for /api and /_next, same as applyDnsPrefetchControlHeader — API
 * responses are governed by the separate API Cache admin page instead.
 * Fails open (no headers touched) on any error.
 */
async function applySecurityCacheHeaders(request: NextRequest, response: NextResponse): Promise<void> {
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith("/api/") || pathname.startsWith("/_next")) return;

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) return;

    let policy = cached(securityCachePolicyCache);
    if (policy === undefined) {
      const policyRes = await fetch(`${supabaseUrl}/rest/v1/rpc/get_security_cache_policy`, {
        method: "POST",
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
          "Content-Type": "application/json",
        },
        body: "{}",
        cache: "no-store",
      });
      if (!policyRes.ok) return;
      policy = normalizeSecurityCachePolicy(await policyRes.json());
      securityCachePolicyCache = { value: policy, expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS };
    }

    const decision = computeCacheDecision({
      policy,
      pathname,
      method: request.method,
      cookieNames: request.cookies.getAll().map((c) => c.name),
      searchParams: request.nextUrl.searchParams,
    });

    if (decision.bypass) {
      response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
      response.headers.set("X-Cache-Security", `bypass:${decision.reason}`);
      return;
    }

    if (decision.varyCookie) {
      response.headers.append("Vary", "Cookie");
    }

    // 6. Signed URLs / Signed Cookies — only for paths explicitly opted in.
    const isProtected =
      (policy.signedUrlsEnabled || policy.signedCookiesEnabled) &&
      policy.signedProtectedPaths.length > 0 &&
      matchesAnyPathPattern(pathname, policy.signedProtectedPaths);

    if (isProtected) {
      const valid = await verifySignedRequest(request, policy, supabaseUrl, supabaseAnonKey);
      if (!valid) {
        response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
        response.headers.set("X-Cache-Security", "signed-invalid");
        return;
      }
      response.headers.set("X-Cache-Security", "signed-valid");
      return;
    }

    response.headers.set("X-Cache-Security", decision.varyCookie ? "cacheable:vary-cookie" : "cacheable");
  } catch {
    // Fail open — a broken lookup should never block the response.
  }
}

/**
 * Checks a signed URL query param (?sig=&exp=, param names configurable)
 * or a signed cookie against verify_cache_signature() in Postgres — never
 * the signing secret itself, which stays server-side in the database. URL
 * signature is checked first since it's cheaper to read; falls back to the
 * signed cookie only if signedCookiesEnabled and no valid query signature
 * was found.
 */
async function verifySignedRequest(
  request: NextRequest,
  policy: SecurityCachePolicy,
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<boolean> {
  const pathname = request.nextUrl.pathname;

  const callVerify = async (sig: string | null | undefined, exp: string | null | undefined): Promise<boolean> => {
    if (!sig || !exp) return false;
    const expNum = Number(exp);
    if (!Number.isFinite(expNum)) return false;
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/rpc/verify_cache_signature`, {
        method: "POST",
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_path: pathname, p_sig: sig, p_exp: expNum }),
        cache: "no-store",
      });
      if (!res.ok) return false;
      return (await res.json()) === true;
    } catch {
      return false;
    }
  };

  if (policy.signedUrlsEnabled) {
    const sig = request.nextUrl.searchParams.get(policy.signedUrlParamName);
    const exp = request.nextUrl.searchParams.get(policy.signedUrlExpiresParamName);
    if (await callVerify(sig, exp)) return true;
  }

  if (policy.signedCookiesEnabled) {
    const cookieValue = request.cookies.get(policy.signedCookieName)?.value;
    if (cookieValue) {
      const parts = cookieValue.split("|");
      if (parts.length === 3 && parts[0] === pathname) {
        if (await callVerify(parts[2], parts[1])) return true;
      }
    }
  }

  return false;
}

/** Fetches access_rules rows (Admin → Security → Access Control), cached
 * for SETTINGS_CACHE_TTL_MS — see the cache block near the top of this
 * file. Table is small (admin-managed rule list), so caching the whole
 * thing and evaluating locally is cheap and safe. */
async function getAccessRules(supabaseUrl: string, supabaseAnonKey: string): Promise<AccessRuleRow[]> {
  const hit = cached(accessRulesCache);
  if (hit) return hit;

  const res = await fetch(`${supabaseUrl}/rest/v1/access_rules?select=rule_type,mode,value`, {
    headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`access_rules fetch failed: ${res.status}`);

  const rows = (await res.json()) as AccessRuleRow[];
  accessRulesCache = { value: rows, expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS };
  return rows;
}

/** Same decision logic as the check_access(p_ip, p_country) Postgres
 * function it replaces (migration 0018), kept in exact lockstep with it:
 * block on an IP/country 'block' match; if any 'allow' rule exists for a
 * rule_type, that type switches to allowlist mode (a non-matching or
 * unknown value is blocked); otherwise allow. Only the rule *rows* are
 * cached (see getAccessRules above) — the decision itself is still
 * recomputed from scratch on every request. */
function evaluateAccessRules(rules: AccessRuleRow[], ip: string | null, country: string | null): "block" | "allow" {
  const matches = (type: "ip" | "country", mode: "block" | "allow", value: string) =>
    rules.some((r) => r.rule_type === type && r.mode === mode && r.value === value);

  if (ip && matches("ip", "block", ip)) return "block";
  if (country && matches("country", "block", country)) return "block";

  const ipAllowlistExists = rules.some((r) => r.rule_type === "ip" && r.mode === "allow");
  if (ipAllowlistExists && ip && !matches("ip", "allow", ip)) return "block";

  const countryAllowlistExists = rules.some((r) => r.rule_type === "country" && r.mode === "allow");
  if (countryAllowlistExists && country && !matches("country", "allow", country)) return "block";

  return "allow";
}

/**
 * IP/country allow/block rules (Admin → Security → Access Control, see
 * access_rules + check_access() in migration 0018). Previously called the
 * check_access() RPC fresh on every request; now reads the (cached) rule
 * rows and evaluates the identical logic locally — see getAccessRules /
 * evaluateAccessRules above. Fails open on any error: a broken check
 * should never take the whole site down.
 */
async function applyAccessControl(request: NextRequest): Promise<NextResponse | null> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) return null;

    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : request.headers.get("x-real-ip");
    const country = request.headers.get("x-vercel-ip-country");
    if (!ip && !country) return null;

    const rules = await getAccessRules(supabaseUrl, supabaseAnonKey);
    if (evaluateAccessRules(rules, ip, country) === "block") {
      return new NextResponse("Access denied.", { status: 403 });
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * CSRF defense for the JSON API: state-changing requests (POST/PUT/
 * PATCH/DELETE) to /api/* must carry an Origin (or, failing that,
 * Referer) header matching this site's own origin. A cross-site page
 * can't set a custom header or control Origin on a simple form/fetch
 * request the way it can with cookies, so this stops the classic
 * "attacker page silently POSTs to your API using the victim's
 * cookies" CSRF pattern. Same-site SameSite=Lax cookies (the Supabase
 * SSR default) already cover most of this; this is defense in depth for
 * the rest. A request with neither header (some non-browser API
 * clients) is allowed through — this is a browser-CSRF mitigation, not
 * authentication.
 *
 * Note: cross-origin GET/HEAD/OPTIONS to private routes is handled
 * earlier in middleware() by blockCrossOriginOnPrivateApi(). This
 * function covers the remaining case: state-changing methods on all
 * /api/* paths (including public ones like /api/comments).
 */
function checkSameOrigin(request: NextRequest): NextResponse | null {
  if (!request.nextUrl.pathname.startsWith("/api/")) return null;
  if (!STATE_CHANGING_METHODS.has(request.method)) return null;

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const source = origin ?? referer;
  if (!source) return null;

  try {
    const sourceOrigin = new URL(source).origin;
    if (sourceOrigin !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
    }
  } catch {
    // Unparseable header — ignore rather than block a legitimate request.
  }
  return null;
}

/** Fetches every *active* seo_redirects row (Redirect Manager) in one
 * call, cached for SETTINGS_CACHE_TTL_MS and keyed by source_path (which
 * is `unique` in the schema — see migration 0010 — so a Map is a lossless
 * representation of the table, not an approximation). Admin-managed table,
 * expected to stay small, so holding the whole active set in memory and
 * matching by exact path locally is cheap and — since source_path has
 * always been an exact-match lookup, never a pattern — behaviourally
 * identical to the previous per-path query. */
async function getActiveRedirects(supabaseUrl: string, supabaseAnonKey: string): Promise<Map<string, RedirectRow>> {
  const hit = cached(redirectsCache);
  if (hit) return hit;

  const res = await fetch(
    `${supabaseUrl}/rest/v1/seo_redirects?is_active=eq.true&select=source_path,destination_path,redirect_type`,
    { headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` }, cache: "no-store" }
  );
  if (!res.ok) throw new Error(`seo_redirects fetch failed: ${res.status}`);

  const rows = (await res.json()) as RedirectRow[];
  const map = new Map(rows.map((r) => [r.source_path, r]));
  redirectsCache = { value: map, expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS };
  return map;
}

/**
 * Looks up `request.nextUrl.pathname` among the (cached) active
 * seo_redirects rows and, if a match exists, returns the redirect/410
 * response — otherwise null so the caller falls through to normal
 * handling. Deliberately fails open: any error (table missing, network
 * hiccup, env vars absent in a preview build) is swallowed and treated as
 * "no redirect", since a broken redirect lookup should never be able to
 * take the whole site down.
 */
async function applyRedirect(request: NextRequest): Promise<NextResponse | null> {
  const path = request.nextUrl.pathname;
  // Skip the lookup for anything that's obviously not a page a redirect
  // would target — keeps the common case (static assets, API, admin) from
  // paying for a network round trip it'll never need.
  if (path.startsWith("/api/") || path.startsWith("/admin") || path.startsWith("/_next")) {
    return null;
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) return null;

    const redirects = await getActiveRedirects(supabaseUrl, supabaseAnonKey);
    const match = redirects.get(path);
    if (!match) return null;

    // Best-effort hit counter — never blocks or fails the redirect itself.
    fetch(`${supabaseUrl}/rest/v1/rpc/record_redirect_hit`, {
      method: "POST",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_source_path: match.source_path }),
    }).catch(() => {});

    if (match.redirect_type === 410) {
      return new NextResponse("Gone", { status: 410 });
    }
    if (!match.destination_path) return null;

    const destination = match.destination_path.startsWith("http")
      ? match.destination_path
      : new URL(match.destination_path, request.url).toString();

    // Guard against a misconfigured rule whose destination resolves back
    // to the exact URL it fires on — without this, that row would send
    // the browser into a redirect loop (repeated full reloads, URL bar
    // flickering) instead of a no-op. Doesn't catch longer A→B→A chains
    // across multiple rows, but those are rare and this is the common
    // accidental-misconfiguration case (e.g. a rule for "/" pointing
    // back to "/", or a relative path that normalizes to itself).
    const destinationUrl = new URL(destination, request.url);
    if (
      destinationUrl.origin === request.nextUrl.origin &&
      destinationUrl.pathname === request.nextUrl.pathname &&
      destinationUrl.search === request.nextUrl.search
    ) {
      return null;
    }

    return NextResponse.redirect(destination, match.redirect_type);
  } catch {
    return null;
  }
}

export const config = {
  matcher: [
    /*
     * Run on every route except static assets and image optimization
     * files, to avoid doing this work on requests that don't need it.
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
