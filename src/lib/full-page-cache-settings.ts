// Shared between the admin client (CacheFullPageAdminClient) and the API
// routes under src/app/api/admin/cache/full-page/**: the shape of the
// full_page_cache_settings row, plus a pure mapper. Mirrors the
// cdn-cache-settings.ts pattern.
//
// Sensitive note: varnish_purge_key is stored in the table but is used only
// to generate on-screen config snippets — it never leaves this app via an
// external API call. The mapper does NOT strip it (unlike the CDN token),
// because the route handlers redact it to a boolean + preview before it
// reaches the browser, matching the CDN approach.

export type FullPageCacheProvider =
  | "none"
  | "litespeed"
  | "nginx_fastcgi"
  | "varnish"
  | "cloudflare_apo"
  | "static_html";

export interface FullPageCacheSettings {
  provider: FullPageCacheProvider;

  // Shared behaviour
  guestCacheEnabled: boolean;
  guestCacheTtlSeconds: number;
  loggedInCacheEnabled: boolean;
  loggedInCachePaths: string[];
  loggedInCacheTtlSeconds: number;
  staticHtmlEnabled: boolean;
  staticHtmlOutputDir: string;

  // Exclusions
  excludedPaths: string[];
  bypassCookies: string[];
  bypassQueryParams: string[];

  // LiteSpeed
  lsCacheTagPrefix: string;
  lsEsiEnabled: boolean;
  lsObjectCacheEnabled: boolean;
  lsBrowserCacheTtlSeconds: number;

  // Nginx FastCGI
  nginxCachePath: string;
  nginxCacheZoneName: string;
  nginxCacheZoneSize: string;
  nginxCacheMaxSize: string;
  nginxCacheKey: string;
  nginxCacheLock: boolean;
  nginxCacheUseStale: string[];

  // Varnish
  varnishBackendHost: string;
  varnishBackendPort: number;
  varnishDefaultTtlSeconds: number;
  varnishGraceSeconds: number;
  /** Whether a purge key is stored. The key itself is never sent to the
   * browser — only this flag + a short preview. */
  varnishPurgeKeySet: boolean;
  varnishPurgeKeyPreview: string | null;

  // Cloudflare APO
  cfApoEnabled: boolean;
  cfApoBypassCookies: string[];
  cfApoBypassPaths: string[];

  updatedAt: string;
}

const PROVIDERS: FullPageCacheProvider[] = [
  "none",
  "litespeed",
  "nginx_fastcgi",
  "varnish",
  "cloudflare_apo",
  "static_html",
];

export const DEFAULT_FULL_PAGE_CACHE_SETTINGS: FullPageCacheSettings = {
  provider: "none",

  guestCacheEnabled: true,
  guestCacheTtlSeconds: 3600,
  loggedInCacheEnabled: false,
  loggedInCachePaths: [],
  loggedInCacheTtlSeconds: 300,
  staticHtmlEnabled: false,
  staticHtmlOutputDir: "/var/cache/app/html",

  excludedPaths: ["/admin/*", "/api/*", "/auth/*"],
  bypassCookies: [
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
    "sb-access-token",
    "sb-refresh-token",
  ],
  bypassQueryParams: ["preview", "nocache", "_rsc"],

  lsCacheTagPrefix: "pb_",
  lsEsiEnabled: false,
  lsObjectCacheEnabled: false,
  lsBrowserCacheTtlSeconds: 86400,

  nginxCachePath: "/var/cache/nginx",
  nginxCacheZoneName: "MOFIGAMES",
  nginxCacheZoneSize: "100m",
  nginxCacheMaxSize: "2g",
  nginxCacheKey: "$scheme$request_method$host$request_uri",
  nginxCacheLock: true,
  nginxCacheUseStale: ["error", "timeout", "updating"],

  varnishBackendHost: "127.0.0.1",
  varnishBackendPort: 3000,
  varnishDefaultTtlSeconds: 3600,
  varnishGraceSeconds: 300,
  varnishPurgeKeySet: false,
  varnishPurgeKeyPreview: null,

  cfApoEnabled: false,
  cfApoBypassCookies: ["wordpress_logged_in_*", "wp-settings-*", "woocommerce_*"],
  cfApoBypassPaths: ["/wp-login.php", "/wp-admin/*", "/checkout/*", "/cart/*", "/my-account/*"],

  updatedAt: new Date(0).toISOString(),
};

/** Redact the Varnish purge key the same way cdn-cache-settings.ts redacts
 * the Cloudflare API token — only a boolean + last-4-chars preview goes to
 * the browser. */
export function redactPurgeKey(key: string | null | undefined): {
  varnishPurgeKeySet: boolean;
  varnishPurgeKeyPreview: string | null;
} {
  if (!key) return { varnishPurgeKeySet: false, varnishPurgeKeyPreview: null };
  return {
    varnishPurgeKeySet: true,
    varnishPurgeKeyPreview: key.length > 4 ? `…${key.slice(-4)}` : "…",
  };
}

/** Maps the snake_case DB row to the camelCase FullPageCacheSettings shape.
 * Called by route handlers AFTER stripping the raw varnish_purge_key —
 * the row passed in here must already have it replaced with the redacted
 * fields (varnish_purge_key_set / varnish_purge_key_preview). */
export function mapFullPageCacheSettingsRow(row: Record<string, unknown> | null): FullPageCacheSettings {
  if (!row) return DEFAULT_FULL_PAGE_CACHE_SETTINGS;

  const provider = String(row.provider ?? "none");

  return {
    provider: PROVIDERS.includes(provider as FullPageCacheProvider)
      ? (provider as FullPageCacheProvider)
      : "none",

    guestCacheEnabled: Boolean(row.guest_cache_enabled ?? true),
    guestCacheTtlSeconds: Number(row.guest_cache_ttl_seconds ?? 3600),
    loggedInCacheEnabled: Boolean(row.logged_in_cache_enabled ?? false),
    loggedInCachePaths: Array.isArray(row.logged_in_cache_paths)
      ? row.logged_in_cache_paths.map(String)
      : [],
    loggedInCacheTtlSeconds: Number(row.logged_in_cache_ttl_seconds ?? 300),
    staticHtmlEnabled: Boolean(row.static_html_enabled ?? false),
    staticHtmlOutputDir: String(row.static_html_output_dir ?? "/var/cache/app/html"),

    excludedPaths: Array.isArray(row.excluded_paths)
      ? row.excluded_paths.map(String)
      : DEFAULT_FULL_PAGE_CACHE_SETTINGS.excludedPaths,
    bypassCookies: Array.isArray(row.bypass_cookies)
      ? row.bypass_cookies.map(String)
      : DEFAULT_FULL_PAGE_CACHE_SETTINGS.bypassCookies,
    bypassQueryParams: Array.isArray(row.bypass_query_params)
      ? row.bypass_query_params.map(String)
      : DEFAULT_FULL_PAGE_CACHE_SETTINGS.bypassQueryParams,

    lsCacheTagPrefix: String(row.ls_cache_tag_prefix ?? "pb_"),
    lsEsiEnabled: Boolean(row.ls_esi_enabled ?? false),
    lsObjectCacheEnabled: Boolean(row.ls_object_cache_enabled ?? false),
    lsBrowserCacheTtlSeconds: Number(row.ls_browser_cache_ttl_seconds ?? 86400),

    nginxCachePath: String(row.nginx_cache_path ?? "/var/cache/nginx"),
    nginxCacheZoneName: String(row.nginx_cache_zone_name ?? "MOFIGAMES"),
    nginxCacheZoneSize: String(row.nginx_cache_zone_size ?? "100m"),
    nginxCacheMaxSize: String(row.nginx_cache_max_size ?? "2g"),
    nginxCacheKey: String(row.nginx_cache_key ?? "$scheme$request_method$host$request_uri"),
    nginxCacheLock: Boolean(row.nginx_cache_lock ?? true),
    nginxCacheUseStale: Array.isArray(row.nginx_cache_use_stale)
      ? row.nginx_cache_use_stale.map(String)
      : ["error", "timeout", "updating"],

    varnishBackendHost: String(row.varnish_backend_host ?? "127.0.0.1"),
    varnishBackendPort: Number(row.varnish_backend_port ?? 3000),
    varnishDefaultTtlSeconds: Number(row.varnish_default_ttl_seconds ?? 3600),
    varnishGraceSeconds: Number(row.varnish_grace_seconds ?? 300),
    varnishPurgeKeySet: Boolean(row.varnish_purge_key_set ?? false),
    varnishPurgeKeyPreview: row.varnish_purge_key_preview
      ? String(row.varnish_purge_key_preview)
      : null,

    cfApoEnabled: Boolean(row.cf_apo_enabled ?? false),
    cfApoBypassCookies: Array.isArray(row.cf_apo_bypass_cookies)
      ? row.cf_apo_bypass_cookies.map(String)
      : DEFAULT_FULL_PAGE_CACHE_SETTINGS.cfApoBypassCookies,
    cfApoBypassPaths: Array.isArray(row.cf_apo_bypass_paths)
      ? row.cf_apo_bypass_paths.map(String)
      : DEFAULT_FULL_PAGE_CACHE_SETTINGS.cfApoBypassPaths,

    updatedAt: String(row.updated_at ?? DEFAULT_FULL_PAGE_CACHE_SETTINGS.updatedAt),
  };
}

// ── Config generators ───────────────────────────────────────────────────────

/** Converts the settings into an Nginx fastcgi_cache / proxy_cache config
 * snippet. The caller can paste this into their server {} block. */
export function generateNginxConfig(s: FullPageCacheSettings): string {
  const excluded = s.excludedPaths
    .map((p) => p.replace(/\*/g, ".*").replace(/^\//, ""))
    .join("|");
  const cookies = s.bypassCookies.join("|");
  const qparams = s.bypassQueryParams.join("|");
  const useStale = s.nginxCacheUseStale.join(" ");

  return `# ── http {} block (nginx.conf or conf.d/mofigames.conf) ──────────────
fastcgi_cache_path ${s.nginxCachePath}/${s.nginxCacheZoneName}
    levels=1:2
    keys_zone=${s.nginxCacheZoneName}:${s.nginxCacheZoneSize}
    max_size=${s.nginxCacheMaxSize}
    inactive=60m
    use_temp_path=off;

map $http_cookie $skip_cache_cookie {
    default 0;
    "~*(${cookies})" 1;
}

map $args $skip_cache_query {
    default 0;
    "~*(^|&)(${qparams})=" 1;
}

# ── server {} block ───────────────────────────────────────────────────
fastcgi_cache_key "${s.nginxCacheKey}";${s.nginxCacheLock ? "\nfastcgi_cache_lock on;" : ""}

set $skip_cache 0;
if ($request_method = POST)        { set $skip_cache 1; }
if ($skip_cache_cookie)            { set $skip_cache 1; }
if ($skip_cache_query)             { set $skip_cache 1; }
if ($request_uri ~* "^/(${excluded})") { set $skip_cache 1; }
${
  s.loggedInCacheEnabled && s.loggedInCachePaths.length > 0
    ? `# Allow cache for logged-in users on whitelisted paths
if ($request_uri ~* "^(${s.loggedInCachePaths.map((p) => p.replace(/\*/g, ".*")).join("|")})") {
    set $skip_cache 0;
}`
    : "# Logged-in user cache is disabled — all authed requests bypass cache."
}

# ── location block (proxy_pass to Node.js / fastcgi) ──────────────────
fastcgi_cache ${s.nginxCacheZoneName};
fastcgi_cache_valid 200 301 ${s.guestCacheTtlSeconds}s;
fastcgi_cache_valid 404 1m;
fastcgi_cache_bypass $skip_cache;
fastcgi_no_cache $skip_cache;
fastcgi_cache_use_stale ${useStale};
fastcgi_cache_background_update on;
add_header X-FastCGI-Cache $upstream_cache_status;
add_header X-Cache-TTL "${s.guestCacheTtlSeconds}";`;
}

/** Generates a Varnish VCL 4.1 config for the Mofigames Next.js app. */
export function generateVarnishConfig(s: FullPageCacheSettings): string {
  const excluded = s.excludedPaths
    .map((p) => p.replace(/\*/g, ".*"))
    .join("|");
  const cookies = s.bypassCookies.join("|");
  const qparams = s.bypassQueryParams.map((p) => `req.url ~ "[?&]${p}="`).join("\n        || ");
  const loggedInPaths =
    s.loggedInCacheEnabled && s.loggedInCachePaths.length > 0
      ? s.loggedInCachePaths.map((p) => p.replace(/\*/g, ".*")).join("|")
      : null;

  return `vcl 4.1;

import std;

backend default {
    .host = "${s.varnishBackendHost}";
    .port = "${s.varnishBackendPort}";
    .connect_timeout = 5s;
    .first_byte_timeout = 30s;
    .between_bytes_timeout = 10s;
}

acl purge_acl {
    "127.0.0.1";
    "::1";
}

sub vcl_recv {
    # PURGE requests — require secret key
    if (req.method == "PURGE") {
        if (!client.ip ~ purge_acl) {
            return (synth(405, "PURGE not allowed from this IP"));
        }
${
  s.varnishPurgeKeySet
    ? `        if (req.http.X-Purge-Key != "${s.varnishPurgeKeySet ? "<your-purge-key>" : ""}") {
            return (synth(403, "Invalid purge key"));
        }`
    : `        # No purge key configured — allow any request from purge_acl`
}
        return (purge);
    }

    # Only handle GET and HEAD
    if (req.method != "GET" && req.method != "HEAD") {
        return (pass);
    }

    # Never cache excluded paths
    if (req.url ~ "^(${excluded})") {
        return (pass);
    }

    # Never cache when bypass query params are present
    if (${qparams}) {
        return (pass);
    }

    # Bypass for logged-in users (session cookies detected)
    if (req.http.Cookie ~ "(${cookies})") {
${
  loggedInPaths
    ? `        # Allow cache for logged-in users on whitelisted paths
        if (req.url !~ "^(${loggedInPaths})") {
            return (pass);
        }`
    : `        return (pass);  # Logged-in user cache disabled`
}
    }

    # Strip cookies from cacheable requests so Varnish can serve from cache
    unset req.http.Cookie;
    return (hash);
}

sub vcl_hash {
    hash_data(req.url);
    if (req.http.host) {
        hash_data(req.http.host);
    } else {
        hash_data(server.ip);
    }
    return (lookup);
}

sub vcl_backend_response {
    # Use configured TTL unless the origin set a shorter one
    if (beresp.ttl < ${s.varnishDefaultTtlSeconds}s) {
        set beresp.ttl = ${s.varnishDefaultTtlSeconds}s;
    }
    # Grace period: serve stale while fetching fresh
    set beresp.grace = ${s.varnishGraceSeconds}s;

    # Don't cache redirects or errors
    if (beresp.status >= 400) {
        set beresp.uncacheable = true;
        set beresp.ttl = 30s;
    }

    return (deliver);
}

sub vcl_deliver {
    # Expose cache status in response header (useful for debugging)
    if (obj.hits > 0) {
        set resp.http.X-Cache = "HIT";
        set resp.http.X-Cache-Hits = obj.hits;
    } else {
        set resp.http.X-Cache = "MISS";
    }
    # Never expose the Via / Age header to clients
    unset resp.http.Via;
    return (deliver);
}`;
}

/** Generates LiteSpeed .htaccess / native cache directives. */
export function generateLiteSpeedConfig(s: FullPageCacheSettings): string {
  const excluded = s.excludedPaths
    .map((p) => p.replace(/\*/, ""))
    .join("|");

  return `# ── LiteSpeed Cache — place in .htaccess or a <VirtualHost> block ────
<IfModule LiteSpeed>
  CacheEnable public /
  CacheDenyPath /${excluded}

  # Guest cache TTL
  CacheDefaultExpire ${s.guestCacheTtlSeconds}
  CacheMaxExpire ${s.guestCacheTtlSeconds * 2}

  # Browser-side asset cache (non-Next.js static files)
  ExpiresByType text/html "${s.lsBrowserCacheTtlSeconds} seconds"

  # Don't cache requests from logged-in users
  CacheControlHeader "X-LiteSpeed-Cache-Control: no-cache" "cookie(${s.bypassCookies.join("|")})"
${s.lsEsiEnabled ? "\n  # ESI — requires LiteSpeed Enterprise / OpenLiteSpeed ESI module\n  ESIEnable on" : ""}
${s.lsObjectCacheEnabled ? "\n  # Object cache — configure in LiteSpeed admin > Cache > Object Cache\n  # ObjectCacheEnable on" : ""}
</IfModule>

# ── Cache tag prefix: ${s.lsCacheTagPrefix} ────────────────────────────────────
# Use this prefix in your application when calling
# LiteSpeed's tag-based PURGE API so only this app's
# entries are evicted.`;
}

/** Generates a Cloudflare APO info block — APO has no config file; it is
 * enabled in the Cloudflare dashboard. This returns setup instructions. */
export function generateCloudflareApoConfig(s: FullPageCacheSettings): string {
  return `# Cloudflare APO — Automatic Platform Optimisation
# ─────────────────────────────────────────────────
# APO is configured entirely in the Cloudflare dashboard, not via files
# on the server. Enable it under:
#   Cloudflare Dashboard → your zone → Speed → Optimization → APO
#
# Note: APO is designed for WordPress. For this Next.js app, the CDN /
# Edge Cache tab (Admin → Cache → CDN / Edge) controls Cloudflare caching
# and is a better fit. APO is documented here for reference only.
#
# Bypass cookies (set these in your APO / Cache Rules):
${s.cfApoBypassCookies.map((c) => `#   ${c}`).join("\n")}
#
# Bypass paths (set these as Cache Rules that bypass the cache):
${s.cfApoBypassPaths.map((p) => `#   ${p}`).join("\n")}
#
# Recommended for Next.js: use the CDN / Edge Cache tab instead.
# APO caching settings are managed at:
#   https://dash.cloudflare.com/ → Speed → Optimization → APO`;
}
