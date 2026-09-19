-- Mofigames — Phase 36: Object Cache, Phase 4 of the Admin → Cache
-- build-out (Phase 1 was 0033 Browser Cache, Phase 2 was 0034 CDN / Edge
-- Cache, Phase 3 was 0035 Full Page Cache).
--
-- "Object cache" means an in-memory key-value store that sits in front of
-- expensive computations (database query results, API responses, computed
-- data) rather than caching whole HTTP responses like 0035 does. Three
-- sibling backends are supported, matching the provider-select pattern
-- from 0035:
--   'redis'                  — Redis / Redis-compatible (Valkey, KeyDB, …).
--   'memcached'               — Memcached, optionally multiple servers.
--   'wordpress_object_cache'  — Documentation-only, like Cloudflare APO in
--                               0035: this app is not WordPress, but the
--                               settings here generate the object-cache.php
--                               drop-in + wp-config.php constants for
--                               hybrid or WP-origin deployments.
--
-- Shared behaviour across the three real backends:
--   - Persistent Object Cache: whether cached values survive across
--     requests (and, for Redis/Memcached, across deploys) via the external
--     store, vs. a cache that only lives for the duration of one request.
--   - Cache Groups: named buckets (mirrors WordPress's cache-group concept)
--     each with their own TTL and independent persistent/global flags —
--     a group can opt out of the external store even when the cache as a
--     whole is persistent (e.g. transient per-request counts), and can be
--     marked "global" (shared across the whole app rather than namespaced
--     per key_prefix scope).
--   - Selective Object Invalidation: evict by group or by key pattern
--     instead of flushing everything. Implemented for real against Redis
--     (SCAN + DEL) when reachable; Memcached's protocol has no key
--     enumeration, so selective invalidation there is documented as a
--     known limitation and falls back to a full flush.
--
-- Redis/Memcached credentials are stored here but — like
-- full_page_cache_settings.varnish_purge_key — are used only for this
-- app's own live connection test / invalidation actions, never sent to a
-- third-party API. Still admin-only via RLS, and passwords are redacted
-- to a boolean + preview before any row reaches the browser (see
-- object-cache-settings.ts).
--
-- Run in Supabase SQL Editor. Safe to run multiple times.

create table if not exists public.object_cache_settings (
  id boolean primary key default true,
  constraint object_cache_settings_single_row check (id),

  -- Which object cache backend is active.
  provider text not null default 'none'
    check (provider in ('none', 'redis', 'memcached', 'wordpress_object_cache')),

  -- ── Shared behaviour ──────────────────────────────────────────────────────

  -- Persistent Object Cache: cached values are written to the external
  -- store (Redis/Memcached) and survive across requests and deploys.
  -- When off, the settings below are still stored for reference but no
  -- live connection/invalidation action is meaningful.
  persistent_enabled boolean not null default false,

  -- Default TTL applied to any cached object whose group doesn't specify
  -- its own. 0 is not a valid default (use a group override for "no
  -- expiry" instead) — keeps a runaway unbounded default from being set
  -- by accident.
  default_ttl_seconds int not null default 3600
    check (default_ttl_seconds between 10 and 2592000),

  -- Prepended to every cache key so purge/invalidation calls from this
  -- app never touch another app's entries on a shared Redis/Memcached
  -- instance. Mirrors ls_cache_tag_prefix in 0035.
  key_prefix text not null default 'pb_',

  -- Named cache groups. Each element:
  --   { "name": string, "ttlSeconds": number, "persistent": boolean, "global": boolean }
  -- ttlSeconds = 0 means "no expiry" for that group. persistent = false
  -- means this group is never written to the external store even when
  -- persistent_enabled is on (matches WordPress's non-persistent groups —
  -- e.g. transient counts that are cheap to recompute and change on
  -- every request). global = true means the group is not namespaced per
  -- key_prefix scope (shared across the whole deployment rather than
  -- one site/tenant).
  cache_groups jsonb not null default '[
    {"name": "posts", "ttlSeconds": 3600, "persistent": true, "global": false},
    {"name": "users", "ttlSeconds": 21600, "persistent": true, "global": true},
    {"name": "transient", "ttlSeconds": 300, "persistent": false, "global": false}
  ]'::jsonb,

  -- ── Redis-specific ────────────────────────────────────────────────────────

  redis_host text not null default '127.0.0.1',
  redis_port int not null default 6379
    check (redis_port between 1 and 65535),
  -- Logical database index (SELECT n). Redis Cluster ignores this; single-
  -- instance/Sentinel deployments commonly use it to separate apps sharing
  -- one Redis server.
  redis_database int not null default 0
    check (redis_database between 0 and 15),
  redis_tls_enabled boolean not null default false,
  -- Redis 6+ ACL username. Blank means the default user (legacy AUTH
  -- <password> form is used when a password is set but no username is).
  redis_username text,
  -- Stored plaintext (used only by this app's own test-connection /
  -- invalidate actions, never forwarded anywhere else — see the redact
  -- helper for what actually reaches the browser).
  redis_password text,
  redis_connect_timeout_ms int not null default 2000
    check (redis_connect_timeout_ms between 100 and 30000),

  -- ── Memcached-specific ────────────────────────────────────────────────────

  -- One or more "host:port" entries. Multiple servers = client-side
  -- consistent-hashing distribution (the actual hashing/sharding is done
  -- by whatever library the app's own cache layer uses — this only
  -- records the server list for config generation + connection testing).
  memcached_servers text[] not null default '{"127.0.0.1:11211"}',
  memcached_binary_protocol boolean not null default false,
  memcached_compression_enabled boolean not null default false,
  memcached_compression_threshold_bytes int not null default 2048
    check (memcached_compression_threshold_bytes between 0 and 10485760),
  -- SASL credentials. Note: the live test-connection/invalidate actions in
  -- this app only speak the unauthenticated classic text protocol — SASL
  -- requires the binary protocol handshake, which isn't implemented here.
  -- Stored for config-generation completeness regardless.
  memcached_username text,
  memcached_password text,

  -- ── WordPress Object Cache-specific (documentation only) ─────────────────

  -- Whether the object-cache.php drop-in is (or would be) installed in
  -- wp-content/. Doesn't do anything from this app — this is a Next.js
  -- deployment, not WordPress — it's a record for hybrid/WP-origin setups
  -- documented via the config generator, same spirit as cf_apo_enabled
  -- in 0035.
  wp_drop_in_installed boolean not null default false,
  -- Maps to the WP_CACHE_KEY_SALT constant — namespaces cache keys when
  -- multiple WordPress installs share one Redis/Memcached instance.
  wp_cache_key_salt text not null default '',

  -- ── Diagnostics ───────────────────────────────────────────────────────────

  last_tested_at timestamptz,
  last_test_status text check (last_test_status in ('success', 'failed')),
  last_test_message text,
  last_invalidated_at timestamptz,
  last_invalidation_summary jsonb,

  -- Metadata
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.object_cache_settings (id)
  values (true)
  on conflict (id) do nothing;

alter table public.object_cache_settings enable row level security;

-- Admin-only for both read and write — this row can contain Redis/
-- Memcached credentials and reveals internal server topology (host, port,
-- database index), same reasoning as full_page_cache_settings (0035).
drop policy if exists "Admins can view object cache settings" on public.object_cache_settings;
create policy "Admins can view object cache settings"
  on public.object_cache_settings for select
  using (public.is_admin());

drop policy if exists "Admins can update object cache settings" on public.object_cache_settings;
create policy "Admins can update object cache settings"
  on public.object_cache_settings for update
  using (public.is_admin())
  with check (public.is_admin());
