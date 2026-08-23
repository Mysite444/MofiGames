-- Mofigames — Migration 0040: API Cache Settings
-- Admin → Cache → API Cache (Phase 8 of the Cache build-out).
-- Previous phases: 0033 Browser Cache, 0034 CDN / Edge Cache,
-- 0035 Full Page Cache, 0036 Object Cache, 0037 Database Optimisation,
-- 0038 PHP OPcache, 0039 Fragment Cache.
--
-- "API Cache" controls how this app's own API route responses are cached
-- and validated. Three complementary mechanisms are configured here:
--
--   1. REST API Caching — adds Cache-Control / Vary headers to JSON
--      REST responses so browsers, CDN edges, and reverse proxies can
--      serve repeat requests without hitting Next.js.
--
--   2. GraphQL Caching — caches GraphQL query results; POST bodies are
--      hashed to form the cache key so identical queries share an entry.
--
--   3. JSON Response Cache — in-process response-level cache keyed on
--      (method, path, vary-headers), sitting above the Fragment Cache
--      layer (which caches page sections) and below Next.js's own fetch
--      cache (which caches upstream fetch() calls).
--
--   4. Endpoint TTL rules — a JSONB array of per-pattern overrides so
--      high-traffic stable endpoints (categories list) can have a longer
--      TTL than volatile ones (leaderboard, trending games).
--
--   5. Conditional Requests — ETag and Last-Modified header generation
--      so clients can make If-None-Match / If-Modified-Since requests
--      and receive 304 Not Modified instead of a full response body when
--      content hasn't changed, reducing bandwidth and TTFB.
--
-- Run in Supabase SQL Editor. Safe to run multiple times.

create table if not exists public.api_cache_settings (
  id boolean primary key default true,
  constraint api_cache_settings_single_row check (id),

  -- ── Master switch ─────────────────────────────────────────────────────────
  enabled boolean not null default false,

  -- ── API-type sub-switches ─────────────────────────────────────────────────
  rest_enabled          boolean not null default true,
  graphql_enabled       boolean not null default false,
  json_response_enabled boolean not null default true,

  -- ── Global TTL / freshness ────────────────────────────────────────────────
  default_ttl_seconds int not null default 300
    check (default_ttl_seconds between 0 and 86400),

  stale_while_revalidate_seconds int not null default 30
    check (stale_while_revalidate_seconds between 0 and 600),

  -- ── Bypass conditions ─────────────────────────────────────────────────────
  -- Skip the cache for requests carrying a valid session / auth header so
  -- personalised responses (user favourites, profile data) never bleed
  -- across users.
  bypass_authenticated boolean not null default true,

  -- Skip the cache whenever the URL contains a query string.  Useful for
  -- search/filter endpoints where every distinct ?q= permutation is its
  -- own logical resource; set to false for endpoints like /api/games?page=2
  -- where query params are safe to include in the cache key.
  bypass_query_string boolean not null default false,

  -- ── Vary headers ──────────────────────────────────────────────────────────
  vary_by_accept          boolean not null default true,
  vary_by_origin          boolean not null default false,
  vary_by_accept_encoding boolean not null default true,

  -- ── Per-endpoint TTL override rules ──────────────────────────────────────
  -- Array of { id, pattern, methods, ttlSeconds, enabled, cacheType, note }.
  -- Pattern is a simple glob: * matches any single path segment,
  -- ** matches any path. Rules are evaluated top-to-bottom; first match wins.
  -- ttlSeconds: 0 = bypass (never cache this endpoint).
  endpoint_rules jsonb not null default '[
    {"id":"rule-games-list",   "pattern":"/api/games",     "methods":["GET","HEAD"],"ttlSeconds":300, "enabled":true, "cacheType":"rest",     "note":"Published games list."},
    {"id":"rule-games-detail", "pattern":"/api/games/*",   "methods":["GET","HEAD"],"ttlSeconds":600, "enabled":true, "cacheType":"rest",     "note":"Individual game metadata."},
    {"id":"rule-categories",   "pattern":"/api/categories","methods":["GET","HEAD"],"ttlSeconds":900, "enabled":true, "cacheType":"rest",     "note":"Category list — stable, 15-min TTL."},
    {"id":"rule-graphql",      "pattern":"/api/graphql",   "methods":["GET","POST"],"ttlSeconds":60,  "enabled":true, "cacheType":"graphql",  "note":"GraphQL endpoint — short TTL, query shape varies."},
    {"id":"rule-admin",        "pattern":"/api/admin/*",   "methods":["GET","POST","PUT","PATCH","DELETE"],"ttlSeconds":0,"enabled":false,"cacheType":"rest","note":"Admin routes — never cached."}
  ]'::jsonb,

  -- ── Conditional Requests ──────────────────────────────────────────────────
  conditional_requests_enabled boolean not null default true,

  -- ETag — an opaque string computed from the response body that lets
  -- clients ask "has this changed?" via If-None-Match. We use a hash of
  -- the serialised JSON body so ETag values are stable across identical
  -- responses regardless of incidental timing differences.
  etag_enabled    boolean not null default true,
  etag_algorithm  text    not null default 'sha256'
    check (etag_algorithm in ('md5', 'sha1', 'sha256')),
  -- Weak ETags (W/"...") survive gzip re-encoding and minor byte-level
  -- differences that don't affect semantic meaning; strong ETags require
  -- byte-for-byte identity. Weak is the safer default for JSON responses
  -- that may be re-serialised with different key ordering.
  etag_weak boolean not null default true,

  -- Last-Modified — a timestamp header that lets clients ask
  -- "has this changed since I last fetched it?" via If-Modified-Since.
  last_modified_enabled              boolean not null default true,
  -- Round timestamps down to the nearest N seconds to avoid unnecessary
  -- cache misses caused by sub-second DB write timestamps.
  last_modified_granularity_seconds  int     not null default 1
    check (last_modified_granularity_seconds between 1 and 3600),

  -- ── Diagnostics ───────────────────────────────────────────────────────────
  last_purged_at    timestamptz,
  last_purge_summary jsonb,   -- { scope, pattern, count }

  -- ── Metadata ──────────────────────────────────────────────────────────────
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);

-- Seed the singleton row on first run.
insert into public.api_cache_settings (id)
  values (true)
  on conflict (id) do nothing;

alter table public.api_cache_settings enable row level security;

-- Admin-only read (unlike fragment/browser cache, this row holds
-- architectural decisions about cache bypass conditions and ETag
-- algorithms — still not credentials, but no reason to expose it
-- publicly).
drop policy if exists "Admins can read api cache settings" on public.api_cache_settings;
create policy "Admins can read api cache settings"
  on public.api_cache_settings for select
  using (public.is_admin());

drop policy if exists "Admins can update api cache settings" on public.api_cache_settings;
create policy "Admins can update api cache settings"
  on public.api_cache_settings for update
  using (public.is_admin())
  with check (public.is_admin());
