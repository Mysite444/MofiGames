-- Mofigames — Migration 0053: Cache Monitoring & Observability
--   (Admin → Cache → Monitoring)
--
-- Two tables, one purpose: a cross-layer view of what is cached, how
-- much space it occupies, when it was last cleared, and how it
-- maintains itself.
--
--   cache_monitoring_settings  (singleton row, admin read+write)
--     ↳ 1. Cache Type / Backend   — redis | file | memcached + connection
--          hints (host, port, db) for display only — never a full DSN.
--     ↳ 2. Storage ceiling        — optional max_storage_mb fed back into
--          the UI's storage bar so it knows what 100% looks like.
--     ↳ 3. Per-layer TTL defaults — page, api, object, fragment, image,
--          static, session, dns, search, feed — the global reference
--          values shown in monitoring; individual sections carry their
--          own fine-grained TTL settings.
--     ↳ 4. Automatic cleanup      — scheduled self-maintenance: interval,
--          max entry age, usage-trigger threshold, and last-run stats.
--
--   cache_purge_logs  (append-only audit log, admin read + server write)
--     ↳ Written by POST /api/admin/cache/monitoring/purge on every
--       manual purge (all or selected layers) and by the auto-cleanup
--       job on every scheduled run.
--     ↳ Records: type (all/selected/auto_cleanup), scope (which layers),
--       entry count cleared, bytes freed, status, triggering user, and
--       an optional detail message.
--     ↳ No row-level UPDATE or DELETE policies — this is intentionally
--       append-only from the app side; rows can only be cleaned up by a
--       super-admin DBA via the Supabase dashboard.
--
-- Admin-only RLS on both tables — same pattern as compression_cache_settings
-- (0051) and security_cache_settings (0052).
--
-- Run in Supabase SQL Editor. Safe to run multiple times.

-- ── 1. Singleton settings row ────────────────────────────────────────────────

create table if not exists public.cache_monitoring_settings (
  id boolean primary key default true,
  constraint cache_monitoring_settings_single_row check (id),

  -- Master monitoring switch — disables live stats polling and automatic
  -- cleanup without discarding configuration.
  enabled boolean not null default true,

  -- ── Cache backend type ────────────────────────────────────────────────────
  -- Which backend is configured for object/session/fragment caches.
  -- The stats route uses this to decide which backend to probe.
  cache_type text not null default 'redis'
    check (cache_type in ('redis', 'file', 'memcached')),

  -- Redis connection hints (display-only in the UI; the actual
  -- REDIS_URL / KV_URL comes from environment variables).
  redis_host text    not null default '127.0.0.1',
  redis_port integer not null default 6379
    check (redis_port between 1 and 65535),
  redis_db   integer not null default 0
    check (redis_db between 0 and 15),

  -- Memcached: one "host:port" string per server.
  memcached_servers text[] not null default '{}',

  -- Optional storage ceiling. 0 = no hard limit configured here
  -- (back-end enforces its own maxmemory or fills the disk).
  max_storage_mb integer not null default 0
    check (max_storage_mb between 0 and 102400),   -- 0 – 100 GB

  -- ── Per-layer TTL defaults (seconds) ─────────────────────────────────────
  -- 60 s (1 min) floor, 31536000 s (1 year) ceiling on every column.
  page_ttl_seconds     integer not null default 86400
    check (page_ttl_seconds between 60 and 31536000),
  api_ttl_seconds      integer not null default 300
    check (api_ttl_seconds between 60 and 31536000),
  object_ttl_seconds   integer not null default 3600
    check (object_ttl_seconds between 60 and 31536000),
  fragment_ttl_seconds integer not null default 1800
    check (fragment_ttl_seconds between 60 and 31536000),
  image_ttl_seconds    integer not null default 31536000
    check (image_ttl_seconds between 60 and 31536000),
  static_ttl_seconds   integer not null default 31536000
    check (static_ttl_seconds between 60 and 31536000),
  session_ttl_seconds  integer not null default 86400
    check (session_ttl_seconds between 60 and 31536000),
  dns_ttl_seconds      integer not null default 300
    check (dns_ttl_seconds between 60 and 31536000),
  search_ttl_seconds   integer not null default 600
    check (search_ttl_seconds between 60 and 31536000),
  feed_ttl_seconds     integer not null default 3600
    check (feed_ttl_seconds between 60 and 31536000),

  -- ── Automatic cache cleanup ───────────────────────────────────────────────
  auto_cleanup_enabled          boolean not null default true,
  -- How often the cleanup job fires, in hours (1 h – 1 week).
  auto_cleanup_interval_hours   integer not null default 24
    check (auto_cleanup_interval_hours between 1 and 168),
  -- Entries older than this (hours) are always evicted (1 h – 1 year).
  auto_cleanup_max_age_hours    integer not null default 168
    check (auto_cleanup_max_age_hours between 1 and 8760),
  -- Cleanup triggers early when usage exceeds this pct (10 – 95).
  auto_cleanup_target_usage_pct integer not null default 80
    check (auto_cleanup_target_usage_pct between 10 and 95),

  -- Last cleanup run diagnostics (written back by the cleanup job).
  last_cleanup_at            timestamptz,
  last_cleanup_status        text
    check (last_cleanup_status in ('success', 'failed')),
  last_cleanup_freed_bytes   bigint not null default 0,
  last_cleanup_removed_count integer not null default 0,

  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

-- Seed the singleton row.
insert into public.cache_monitoring_settings (id)
values (true)
on conflict (id) do nothing;

-- ── 2. Purge log table ───────────────────────────────────────────────────────

create table if not exists public.cache_purge_logs (
  id bigserial primary key,

  -- "all" wipes every layer; "selected" = specific layers via purge_scope;
  -- "auto_cleanup" = fired by the scheduled cleanup job.
  purge_type text not null
    check (purge_type in ('all', 'selected', 'auto_cleanup')),

  -- Which cache layers were targeted for a "selected" purge (empty for "all").
  purge_scope text[] not null default '{}',

  -- How many cache entries were removed.
  purge_count integer not null default 0,

  -- Bytes freed (0 when the backend doesn't expose per-key sizes cheaply).
  purge_size_bytes bigint not null default 0,

  -- Outcome: partial is used when some layers succeeded and some failed.
  status text not null default 'success'
    check (status in ('success', 'failed', 'partial')),

  -- Optional detail — error message on failure, extra info on partial.
  message text,

  -- Who triggered this action (null for automated cleanup jobs).
  triggered_by uuid references auth.users (id) on delete set null,
  triggered_at timestamptz not null default now()
);

-- Index to make newest-first pagination fast.
create index if not exists cache_purge_logs_triggered_at_idx
  on public.cache_purge_logs (triggered_at desc);

-- ── Row-Level Security ───────────────────────────────────────────────────────

alter table public.cache_monitoring_settings enable row level security;

drop policy if exists "Admins can read cache monitoring settings"
  on public.cache_monitoring_settings;
create policy "Admins can read cache monitoring settings"
  on public.cache_monitoring_settings for select
  using (public.is_admin());

drop policy if exists "Admins can update cache monitoring settings"
  on public.cache_monitoring_settings;
create policy "Admins can update cache monitoring settings"
  on public.cache_monitoring_settings for update
  using (public.is_admin())
  with check (public.is_admin());

-- ── Purge logs RLS ───────────────────────────────────────────────────────────

alter table public.cache_purge_logs enable row level security;

-- Admins can read the full history.
drop policy if exists "Admins can read cache purge logs"
  on public.cache_purge_logs;
create policy "Admins can read cache purge logs"
  on public.cache_purge_logs for select
  using (public.is_admin());

-- The server-side purge route (running as an admin session) can insert
-- new log entries. No UPDATE or DELETE — the log is intentionally
-- append-only from the application layer.
drop policy if exists "Admins can insert cache purge logs"
  on public.cache_purge_logs;
create policy "Admins can insert cache purge logs"
  on public.cache_purge_logs for insert
  with check (public.is_admin());
