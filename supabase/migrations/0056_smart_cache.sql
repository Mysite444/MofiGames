-- Mofigames — Migration 0056: Smart Cache Management
-- Admin → Cache → Smart Cache Management.
-- Single-row table (id = true) for nine intelligent cache lifecycle
-- pillars:
--   1. Automatic Cache Invalidation  — rule-based clearing on CMS events
--   2. Selective Purge               — targeted URL / pattern purging
--   3. Cache Tags                    — surrogate-key / tag-based grouping
--   4. Scheduled Cache Warming       — cron-driven pre-population
--   5. Background Cache Regeneration — async refill after invalidation
--   6. Request Coalescing            — collapse concurrent cache misses
--   7. Cache Locking                 — mutex on cache writes (anti-stampede)
--   8. Stale-While-Revalidate        — serve stale while refreshing
--   9. Stale-If-Error                — serve stale when origin errors
--
-- RLS: admin-only read + write (same as edge_cache_settings).

create table if not exists public.smart_cache_settings (
  id boolean primary key default true,
  constraint smart_cache_settings_single_row check (id),

  -- ── 1. Automatic Cache Invalidation ─────────────────────────────────
  auto_invalidation_enabled  boolean   not null default false,
  -- JSONB array of {id, name, pattern, triggers[], enabled} objects
  invalidation_rules         jsonb     not null default '[]'::jsonb,
  invalidate_on_publish      boolean   not null default true,
  invalidate_on_update       boolean   not null default true,
  invalidate_on_delete       boolean   not null default true,
  invalidation_delay_ms      integer   not null default 0
    check (invalidation_delay_ms between 0 and 60000),

  -- ── 2. Selective Purge ──────────────────────────────────────────────
  selective_purge_enabled    boolean   not null default true,
  last_purge_at              timestamptz,
  last_purge_status          text
    check (last_purge_status in ('success', 'partial', 'failed')),
  last_purge_summary         jsonb,

  -- ── 3. Cache Tags ────────────────────────────────────────────────────
  cache_tags_enabled         boolean   not null default false,
  -- JSONB array of {id, tag, description, patterns[]} objects
  cache_tags                 jsonb     not null default '[]'::jsonb,
  tag_header_name            text      not null default 'Cache-Tag'
    check (tag_header_name in ('Cache-Tag', 'Surrogate-Key', 'X-Cache-Tags')),
  max_tags_per_response      integer   not null default 50
    check (max_tags_per_response between 1 and 100),

  -- ── 4. Scheduled Cache Warming ───────────────────────────────────────
  scheduled_warming_enabled  boolean   not null default false,
  warming_schedule           text      not null default '0 4 * * *',
  warming_urls               text[]    not null default '{/,/games,/categories}',
  warming_concurrency        integer   not null default 5
    check (warming_concurrency between 1 and 20),
  warming_timeout_ms         integer   not null default 8000
    check (warming_timeout_ms between 1000 and 30000),
  last_warming_at            timestamptz,
  last_warming_status        text
    check (last_warming_status in ('success', 'partial', 'failed')),
  last_warming_summary       jsonb,

  -- ── 5. Background Cache Regeneration ─────────────────────────────────
  background_regen_enabled   boolean   not null default false,
  regen_concurrency          integer   not null default 3
    check (regen_concurrency between 1 and 10),
  regen_delay_ms             integer   not null default 500
    check (regen_delay_ms between 0 and 60000),
  regen_priority_urls        text[]    not null default '{/,/games}',

  -- ── 6. Request Coalescing ─────────────────────────────────────────────
  request_coalescing_enabled boolean   not null default false,
  coalescing_window_ms       integer   not null default 200
    check (coalescing_window_ms between 50 and 5000),
  coalescing_max_waiters     integer   not null default 50
    check (coalescing_max_waiters between 1 and 200),

  -- ── 7. Cache Locking ──────────────────────────────────────────────────
  cache_locking_enabled      boolean   not null default false,
  lock_ttl_ms                integer   not null default 5000
    check (lock_ttl_ms between 500 and 30000),
  lock_timeout_ms            integer   not null default 10000
    check (lock_timeout_ms between 500 and 30000),
  lock_retry_interval_ms     integer   not null default 100
    check (lock_retry_interval_ms between 50 and 2000),

  -- ── 8. Stale-While-Revalidate ─────────────────────────────────────────
  stale_while_revalidate_enabled  boolean not null default false,
  stale_while_revalidate_seconds  integer not null default 60
    check (stale_while_revalidate_seconds between 0 and 86400),
  swi_apply_to_paths         text[]    not null default '{}',

  -- ── 9. Stale-If-Error ─────────────────────────────────────────────────
  stale_if_error_enabled     boolean   not null default false,
  stale_if_error_seconds     integer   not null default 300
    check (stale_if_error_seconds between 0 and 604800),
  -- HTTP status codes that activate stale-if-error
  stale_if_error_codes       integer[] not null default '{500,502,503,504}',

  -- ── Audit ──────────────────────────────────────────────────────────────
  updated_at                 timestamptz not null default now(),
  updated_by                 uuid references auth.users(id) on delete set null
);

-- Seed the single row so GET requests always find a record.
insert into public.smart_cache_settings (id)
values (true)
on conflict (id) do nothing;

-- ── Row-Level Security ────────────────────────────────────────────────────────

alter table public.smart_cache_settings enable row level security;

-- Admin-only read
create policy "smart_cache_settings_select_admin"
  on public.smart_cache_settings for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.is_admin = true
    )
  );

-- Admin-only update
create policy "smart_cache_settings_update_admin"
  on public.smart_cache_settings for update
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.is_admin = true
    )
  );

-- Admin-only insert (for the on-conflict seed path and upsert fallback)
create policy "smart_cache_settings_insert_admin"
  on public.smart_cache_settings for insert
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.is_admin = true
    )
  );
