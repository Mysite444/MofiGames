-- Mofigames — Phase 35: Full Page Cache, Phase 3 of the Admin → Cache
-- build-out (Phase 1 was 0033 Browser Cache, Phase 2 was 0034 CDN / Edge
-- Cache).
--
-- "Full page cache" means a server-level reverse proxy or host module
-- (LiteSpeed, Nginx FastCGI, Varnish, Cloudflare APO, or pre-built static
-- HTML files) that serves complete, pre-rendered responses without touching
-- the Next.js Node.js process at all. It is the highest-leverage cache layer
-- for public traffic and also the riskiest if misconfigured — a logged-in
-- user's page served to a guest, or an admin page accidentally cached, is a
-- data-exposure bug, not just a performance issue.
--
-- This table stores:
--   1. Which provider is active (or 'none' for passthrough).
--   2. Shared behaviour settings — Guest Page Cache, Logged-in User Cache,
--      Static HTML generation, exclusion paths / bypass cookies / bypass
--      query params.
--   3. Provider-specific tuning knobs for each supported backend.
--
-- The Admin UI uses this row to:
--   a. Display the current configuration.
--   b. Generate ready-to-paste server config snippets (nginx.conf excerpt,
--      VCL 4.1, .htaccess directives) so the admin doesn't have to write
--      them from scratch.
--   c. Run a live header detect to see what's actually serving from cache.
--
-- Unlike cdn_cache_settings (0034), this table does NOT contain secrets —
-- varnish_purge_key is stored here but is used to generate config output,
-- not to call an external API. It is still admin-only via RLS.
--
-- Run in Supabase SQL Editor. Safe to run multiple times.

create table if not exists public.full_page_cache_settings (
  id boolean primary key default true,
  constraint full_page_cache_settings_single_row check (id),

  -- Which server-level cache technology is active.
  -- 'none'          — no full-page cache; every request hits Next.js.
  -- 'litespeed'     — LiteSpeed Web Server native cache module / .htaccess.
  -- 'nginx_fastcgi' — Nginx fastcgi_cache (or proxy_cache for Node proxying).
  -- 'varnish'       — Varnish Cache reverse proxy (VCL 4.1).
  -- 'cloudflare_apo'— Cloudflare Automatic Platform Optimisation (WordPress).
  -- 'static_html'   — Pre-built static HTML files served directly.
  provider text not null default 'none'
    check (provider in ('none', 'litespeed', 'nginx_fastcgi', 'varnish', 'cloudflare_apo', 'static_html')),

  -- ── Shared behaviour ──────────────────────────────────────────────────────

  -- Guest Page Cache: serve cached responses to unauthenticated visitors.
  -- Safe because there is no per-user content when no session cookie is set.
  -- The default TTL of one hour balances freshness vs. server load.
  guest_cache_enabled boolean not null default true,
  guest_cache_ttl_seconds int not null default 3600
    check (guest_cache_ttl_seconds between 60 and 2592000),

  -- Logged-in User Cache: cache responses even for authenticated users.
  -- Dangerous unless restricted to pages that are provably identical for all
  -- users. Disabled by default; the path allowlist below is the safety guard
  -- when it is turned on — an empty list means nothing is cached even if the
  -- toggle is on.
  logged_in_cache_enabled boolean not null default false,
  -- Specific URL path prefixes that are safe to cache for authenticated users
  -- (e.g. /games/* where the page body doesn't include user-specific data).
  logged_in_cache_paths text[] not null default '{}',
  logged_in_cache_ttl_seconds int not null default 300
    check (logged_in_cache_ttl_seconds between 60 and 86400),

  -- Static HTML Cache: write rendered pages to disk as .html files so the
  -- web server can serve them without invoking Node.js at all. Most useful
  -- with Nginx or LiteSpeed when the site has a large proportion of public,
  -- rarely-changing pages.
  static_html_enabled boolean not null default false,
  static_html_output_dir text not null default '/var/cache/app/html',

  -- ── Exclusions (always enforced in generated configs) ─────────────────────

  -- URL paths that must never be served from the full-page cache.
  -- /admin/*, /api/*, /auth/* are included in the schema default; the admin
  -- UI renders these as always-present and non-removable.
  excluded_paths text[] not null default '{"/admin/*", "/api/*", "/auth/*"}',

  -- Cookie names whose presence in the request signals a user-specific session.
  -- Any request carrying one of these cookies bypasses the cache entirely,
  -- regardless of the guest/logged-in toggles above.
  bypass_cookies text[] not null default
    '{"next-auth.session-token", "__Secure-next-auth.session-token", "sb-access-token", "sb-refresh-token"}',

  -- Query string parameters that should bypass the cache (e.g. ?preview=1,
  -- ?nocache=true). Generated configs test for their presence and pass the
  -- request through to the origin if found.
  bypass_query_params text[] not null default '{"preview", "nocache", "_rsc"}',

  -- ── LiteSpeed-specific ────────────────────────────────────────────────────

  -- Short string prepended to every LiteSpeed cache tag so purge calls from
  -- this app don't accidentally evict entries belonging to other vhosts
  -- sharing the same server cache store.
  ls_cache_tag_prefix text not null default 'pb_',
  -- ESI (Edge Side Includes): lets LiteSpeed stitch together a mostly-cached
  -- page with a dynamic fragment (e.g. the logged-in user's avatar). Requires
  -- LiteSpeed Enterprise or OpenLiteSpeed with the ESI module.
  ls_esi_enabled boolean not null default false,
  -- LiteSpeed Object Cache: an in-memory key-value store separate from the
  -- full-page HTML cache. Used for database query results / API responses.
  ls_object_cache_enabled boolean not null default false,
  -- How long LiteSpeed tells the browser to cache assets it controls (separate
  -- from what Next.js sets on /_next/static — this applies to LiteSpeed's own
  -- static file serving for any non-Next assets in public/).
  ls_browser_cache_ttl_seconds int not null default 86400
    check (ls_browser_cache_ttl_seconds between 60 and 2592000),

  -- ── Nginx FastCGI Cache-specific ──────────────────────────────────────────

  -- Directory on disk where Nginx writes its cache files. Must be on a
  -- filesystem with enough space for nginx_cache_max_size.
  nginx_cache_path text not null default '/var/cache/nginx',
  -- Name of the shared memory zone (fastcgi_cache_path keys_zone=<name>:<size>).
  nginx_cache_zone_name text not null default 'MOFIGAMES',
  -- Size of the in-memory keys zone (not the on-disk cache — just the index).
  nginx_cache_zone_size text not null default '100m',
  -- Maximum total size of on-disk cached files. Nginx evicts LRU entries when
  -- this limit is reached.
  nginx_cache_max_size text not null default '2g',
  -- Cache key: should uniquely identify a response. Changing this invalidates
  -- all existing cache entries.
  nginx_cache_key text not null default '$scheme$request_method$host$request_uri',
  -- fastcgi_cache_lock: prevents multiple upstream requests for the same
  -- cache-miss URL ("thundering herd"). Recommended to keep on.
  nginx_cache_lock boolean not null default true,
  -- Conditions under which Nginx may serve a stale cached response rather
  -- than waiting for the upstream (guards against origin downtime / slow
  -- responses). Subset of: error, timeout, invalid_header, updating,
  -- http_500, http_502, http_503, http_504.
  nginx_cache_use_stale text[] not null default '{"error", "timeout", "updating"}',

  -- ── Varnish-specific ──────────────────────────────────────────────────────

  -- Origin backend (the Next.js app) Varnish proxies to.
  varnish_backend_host text not null default '127.0.0.1',
  varnish_backend_port int not null default 3000
    check (varnish_backend_port between 1 and 65535),
  -- Default TTL for objects Varnish keeps in cache (overridden by
  -- Cache-Control headers from the origin when present).
  varnish_default_ttl_seconds int not null default 3600
    check (varnish_default_ttl_seconds between 60 and 2592000),
  -- Grace period: how long Varnish may serve a stale cached object while
  -- asynchronously fetching a fresh one. Shields the origin from spikes.
  varnish_grace_seconds int not null default 300
    check (varnish_grace_seconds between 0 and 86400),
  -- Secret key expected in the X-Purge-Key request header on PURGE requests.
  -- Generated configs include a vcl_recv rule that rejects PURGE calls without
  -- this key. Stored plaintext (used only in generated config output, never
  -- sent to an external API — unlike the Cloudflare token in 0034).
  varnish_purge_key text,

  -- ── Cloudflare APO-specific ───────────────────────────────────────────────

  -- Cloudflare Automatic Platform Optimisation — a Cloudflare product built
  -- for WordPress that caches full HTML pages at the edge, bypassing the
  -- origin on cache hits. Listed here for completeness; for Next.js, the CDN
  -- / Edge Cache tab (0034) covers the Cloudflare-specific controls. APO
  -- credentials are managed via the Cloudflare dashboard; no API calls are
  -- made from this app for APO.
  cf_apo_enabled boolean not null default false,
  -- Cookie names that signal APO should bypass its cache for this request.
  cf_apo_bypass_cookies text[] not null default
    '{"wordpress_logged_in_*", "wp-settings-*", "woocommerce_*"}',
  -- URL path patterns where APO bypasses its cache entirely.
  cf_apo_bypass_paths text[] not null default
    '{"/wp-login.php", "/wp-admin/*", "/checkout/*", "/cart/*", "/my-account/*"}',

  -- Metadata
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.full_page_cache_settings (id)
  values (true)
  on conflict (id) do nothing;

alter table public.full_page_cache_settings enable row level security;

-- Admin-only for both read and write. Unlike cache_settings (0033) this row
-- is NOT publicly readable — it can contain a Varnish purge key and reveals
-- internal server topology (backend host/port, cache paths) that should not
-- be exposed to unauthenticated visitors.
drop policy if exists "Admins can view full page cache settings" on public.full_page_cache_settings;
create policy "Admins can view full page cache settings"
  on public.full_page_cache_settings for select
  using (public.is_admin());

drop policy if exists "Admins can update full page cache settings" on public.full_page_cache_settings;
create policy "Admins can update full page cache settings"
  on public.full_page_cache_settings for update
  using (public.is_admin())
  with check (public.is_admin());
