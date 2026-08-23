-- Mofigames — Migration 0037: Database Optimisation & Query Cache
-- Admin → Cache → Database Optimisation (Phase 5 of the Cache build-out).
--
-- Five features live under this table:
--   1. Redis Query Cache      — Redis as a transparent query-result cache.
--   2. Cached Query Results   — Named query slots with per-slot TTL overrides.
--   3. Prepared Statements    — Connection-pool prepared-statement settings.
--   4. Query Optimisation     — slow-query threshold, statement_timeout, work_mem.
--   5. Database Index Optim.  — auto-analyze schedule, REINDEX requests, recommendations.
--
-- Credentials (redis_query_password) follow the same redaction pattern as
-- object_cache_settings.redis_password — stored here, never forwarded to
-- a third-party API, redacted to boolean+preview before the row reaches
-- the browser.
--
-- Run in Supabase SQL Editor. Safe to run multiple times.

create table if not exists public.db_optimization_settings (
  id boolean primary key default true,
  constraint db_optimization_settings_single_row check (id),

  -- ── 1. Redis Query Cache ──────────────────────────────────────────────────

  redis_query_cache_enabled      boolean  not null default false,
  redis_query_host               text     not null default '127.0.0.1',
  redis_query_port               int      not null default 6379
    check (redis_query_port between 1 and 65535),
  redis_query_database           int      not null default 1
    check (redis_query_database between 0 and 15),
  redis_query_tls_enabled        boolean  not null default false,
  redis_query_username           text,
  -- Plaintext, used only for this app's own test/flush actions, never
  -- forwarded externally. Same reasoning as object_cache_settings.redis_password.
  redis_query_password           text,
  redis_query_connect_timeout_ms int      not null default 2000
    check (redis_query_connect_timeout_ms between 100 and 30000),

  -- ── 2. Cached Query Results ───────────────────────────────────────────────

  -- Default TTL for query-cache entries (seconds).
  query_cache_default_ttl_seconds int not null default 300
    check (query_cache_default_ttl_seconds between 5 and 86400),

  -- Key prefix so query-cache keys never collide with object-cache keys
  -- on a shared Redis instance.
  query_cache_key_prefix text not null default 'pbq_',

  -- Named query slots. Each element:
  --   { "name": string, "pattern": string, "ttlSeconds": number, "enabled": boolean }
  -- "pattern" is a human-readable label for which queries this slot covers
  -- (e.g. "homepage_games", "category_list") — no actual SQL pattern
  -- matching is performed here; the application code must map its own
  -- query keys to these slot names.
  cached_query_slots jsonb not null default '[
    {"name":"homepage_games",  "pattern":"SELECT … FROM games ORDER BY plays",   "ttlSeconds":120,  "enabled":true},
    {"name":"category_list",   "pattern":"SELECT * FROM categories",             "ttlSeconds":600,  "enabled":true},
    {"name":"featured_games",  "pattern":"SELECT … WHERE is_featured = true",    "ttlSeconds":180,  "enabled":true},
    {"name":"tag_list",        "pattern":"SELECT * FROM tags",                   "ttlSeconds":1800, "enabled":true},
    {"name":"leaderboard_top", "pattern":"SELECT … ORDER BY score DESC LIMIT 20","ttlSeconds":60,   "enabled":false}
  ]'::jsonb,

  -- ── 3. Prepared Statements ────────────────────────────────────────────────

  prepared_statements_enabled      boolean not null default true,
  -- Max number of prepared statements kept open per connection. PgBouncer
  -- in transaction-pool mode does not support named statements — use
  -- session mode if enabling this. 0 = unlimited (Postgres default).
  max_prepared_statements          int     not null default 0
    check (max_prepared_statements between 0 and 10000),
  -- statement_timeout applied at the session level (ms). 0 = no timeout.
  statement_timeout_ms             int     not null default 30000
    check (statement_timeout_ms between 0 and 600000),
  -- lock_timeout to prevent indefinite lock waits (ms). 0 = no timeout.
  lock_timeout_ms                  int     not null default 5000
    check (lock_timeout_ms between 0 and 300000),
  -- idle_in_transaction_session_timeout (ms). 0 = no timeout.
  idle_in_transaction_timeout_ms   int     not null default 10000
    check (idle_in_transaction_timeout_ms between 0 and 300000),

  -- ── 4. Query Optimisation ─────────────────────────────────────────────────

  -- Slow-query log: queries taking longer than this threshold are written
  -- to a log table. 0 = disabled.
  slow_query_threshold_ms          int     not null default 500
    check (slow_query_threshold_ms between 0 and 60000),

  -- work_mem hint surfaced to the admin (the actual SET is done at the
  -- connection level in app code). Stored as kB; Postgres unit is kB.
  work_mem_kb                      int     not null default 4096
    check (work_mem_kb between 1024 and 524288),

  -- Connection pool mode advice shown on the UI.
  pool_mode                        text    not null default 'transaction'
    check (pool_mode in ('session', 'transaction', 'statement')),
  pool_size                        int     not null default 25
    check (pool_size between 1 and 500),

  -- EXPLAIN ANALYZE: whether the admin dashboard should show query plan
  -- snippets on demand. Off by default — running EXPLAIN ANALYZE on
  -- production queries has a real cost.
  explain_analyze_enabled          boolean not null default false,

  -- ── 5. Database Index Optimisation ───────────────────────────────────────

  -- Auto-analyze: whether a cron job should call ANALYZE on key tables
  -- nightly. The cron job itself is configured under Automation; this
  -- flag just controls whether the UI shows it as active.
  auto_analyze_enabled             boolean not null default true,
  auto_analyze_schedule            text    not null default '0 3 * * *',  -- 03:00 UTC daily

  -- REINDEX: admin can queue a REINDEX CONCURRENTLY run on a named table.
  -- Stored as a JSONB list so the automation job can pick it up:
  --   [{"table": "games", "requestedAt": "2025-…", "status": "pending"}]
  pending_reindex_requests         jsonb   not null default '[]'::jsonb,

  -- Last time the admin ran ANALYZE manually (informational).
  last_analyze_run_at              timestamptz,
  last_analyze_summary             jsonb,

  -- Index recommendations generated by the last scan (JSONB array of
  -- recommendation objects — purely informational, not auto-applied).
  index_recommendations            jsonb   not null default '[]'::jsonb,
  last_index_scan_at               timestamptz,

  -- ── Diagnostics ───────────────────────────────────────────────────────────

  last_query_cache_tested_at       timestamptz,
  last_query_cache_test_status     text check (last_query_cache_test_status in ('success', 'failed')),
  last_query_cache_test_message    text,
  last_query_cache_flushed_at      timestamptz,

  -- Metadata
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id) on delete set null
);

insert into public.db_optimization_settings (id)
  values (true)
  on conflict (id) do nothing;

alter table public.db_optimization_settings enable row level security;

drop policy if exists "Admins can view db optimization settings" on public.db_optimization_settings;
create policy "Admins can view db optimization settings"
  on public.db_optimization_settings for select
  using (public.is_admin());

drop policy if exists "Admins can update db optimization settings" on public.db_optimization_settings;
create policy "Admins can update db optimization settings"
  on public.db_optimization_settings for update
  using (public.is_admin())
  with check (public.is_admin());

-- Slow-query log table (populated by app-level instrumentation).
create table if not exists public.slow_query_log (
  id          bigserial primary key,
  query_hash  text         not null,
  query_label text,
  duration_ms int          not null,
  logged_at   timestamptz  not null default now(),
  context     jsonb
);

alter table public.slow_query_log enable row level security;

drop policy if exists "Admins can view slow query log" on public.slow_query_log;
create policy "Admins can view slow query log"
  on public.slow_query_log for select
  using (public.is_admin());

-- Index to support the admin panel's recent-log queries.
create index if not exists slow_query_log_logged_at_idx on public.slow_query_log (logged_at desc);
create index if not exists slow_query_log_duration_idx  on public.slow_query_log (duration_ms desc);
