-- Mofigames — Migration 0055: Analytics Cache
-- Admin → Cache → Analytics Cache.
-- Single-row table (id = true) covering the five analytics data-caching
-- pillars: Dashboard Statistics, Visitor Counts, Popular Games, Reports,
-- and Aggregated Metrics. Each pillar has its own enabled toggle and TTL
-- so they can be tuned or disabled independently.
--
-- This table stores configuration for how long each analytics result set
-- should be cached, not the cached data itself. The application-level
-- cache sits in Supabase (query results) and optionally in-process. The
-- purge route marks the relevant rows as stale; the aggregate route
-- re-computes the roll-ups and updates tracking columns below.
--
-- RLS: admin-only read+write — mirrors cdn_cache_settings / edge_cache_settings.

create table if not exists analytics_cache_settings (
  id boolean primary key default true,
  check (id),                 -- enforces single-row

  -- ── 1. Dashboard Statistics ──────────────────────────────────────────────
  -- Cached result of the homepage/overview stat computations (total games,
  -- total users, total plays, new signups today, etc.)
  dashboard_stats_enabled               boolean  not null default true,
  dashboard_stats_ttl_seconds           integer  not null default 300,
  dashboard_stats_stale_while_revalidate integer not null default 60,

  -- ── 2. Visitor Counts ────────────────────────────────────────────────────
  -- Cached page-view / unique-visitor counts bucketed by resolution.
  -- 'realtime'  — cache for ≤ 30 s, suitable for a live counter widget
  -- 'minutely'  — 1-min buckets, good for dashboards refreshed every minute
  -- 'hourly'    — cheapest; recommended for anything shown in aggregate
  -- 'daily'     — almost static; long TTL is safe
  visitor_counts_enabled                boolean  not null default true,
  visitor_counts_ttl_seconds            integer  not null default 600,
  visitor_counts_resolution             text     not null default 'hourly'
    check (visitor_counts_resolution in ('realtime', 'minutely', 'hourly', 'daily')),
  visitor_counts_retention_days         integer  not null default 90,
  visitor_counts_unique_tracking        boolean  not null default true,

  -- ── 3. Popular Games ─────────────────────────────────────────────────────
  -- Cached ranked list of most-played / highest-rated games. Feeds the
  -- "Popular" homepage rail, the game-recommendation sidebar, and the
  -- internal analytics dashboard.
  popular_games_enabled                 boolean  not null default true,
  popular_games_ttl_seconds             integer  not null default 900,
  popular_games_top_n                   integer  not null default 50,
  popular_games_window_days             integer  not null default 7,
  popular_games_score_weights           jsonb    not null default '{"plays": 0.6, "rating": 0.3, "recency": 0.1}',
  popular_games_exclude_nsfw            boolean  not null default true,

  -- ── 4. Reports ───────────────────────────────────────────────────────────
  -- Cached pre-computed report payloads (e.g. CSV exports, date-range
  -- summaries). Long TTL is appropriate because reports are point-in-time
  -- snapshots. precompute_enabled triggers background generation of
  -- commonly-requested date ranges so the first request is always a hit.
  reports_enabled                       boolean  not null default true,
  reports_ttl_seconds                   integer  not null default 3600,
  reports_max_range_days                integer  not null default 365,
  reports_precompute_enabled            boolean  not null default false,
  reports_precompute_ranges             text[]   not null default '{7,30,90}',

  -- ── 5. Aggregated Metrics ────────────────────────────────────────────────
  -- Roll-up computations (plays per game per day, conversion rates, session
  -- duration averages) that are expensive to compute on the fly. The batch
  -- size and aggregation window control how coarse the roll-ups are; smaller
  -- batches mean more granular data but more writes.
  aggregated_metrics_enabled            boolean  not null default true,
  aggregated_metrics_ttl_seconds        integer  not null default 1800,
  aggregated_metrics_batch_size         integer  not null default 500,
  aggregated_metrics_window             text     not null default 'daily'
    check (aggregated_metrics_window in ('hourly', 'daily', 'weekly', 'monthly')),
  aggregated_metrics_auto_run           boolean  not null default true,
  aggregated_metrics_run_interval_hours integer  not null default 6,

  -- ── Purge tracking ───────────────────────────────────────────────────────
  last_purged_at                        timestamptz,
  last_purged_by                        uuid     references auth.users(id) on delete set null,
  last_purge_scope                      text,    -- e.g. 'all' | 'dashboard' | 'visitor_counts' | …
  last_purge_entries_removed            integer  not null default 0,

  -- ── Aggregation tracking ─────────────────────────────────────────────────
  last_aggregated_at                    timestamptz,
  last_aggregation_status               text
    check (last_aggregation_status in ('success', 'partial', 'failed')),
  last_aggregation_duration_ms          integer,
  last_aggregation_rows_processed       integer,

  updated_at                            timestamptz not null default now(),
  updated_by                            uuid     references auth.users(id) on delete set null
);

-- Seed the single row so GET requests always find a record.
insert into analytics_cache_settings (id)
values (true)
on conflict (id) do nothing;

-- ── Row-Level Security ────────────────────────────────────────────────────────
alter table analytics_cache_settings enable row level security;

-- Admin-only read
create policy "analytics_cache_settings_select_admin"
  on analytics_cache_settings for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.is_admin = true
    )
  );

-- Admin-only update
create policy "analytics_cache_settings_update_admin"
  on analytics_cache_settings for update
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.is_admin = true
    )
  );

-- Admin-only insert (for the on-conflict seed path in route handlers)
create policy "analytics_cache_settings_insert_admin"
  on analytics_cache_settings for insert
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.is_admin = true
    )
  );
