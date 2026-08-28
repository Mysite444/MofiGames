-- Mofigames — Migration 0054: Edge Cache
-- Admin → Cache → Edge Cache.
-- Single-row table (id = true) for the six Cloudflare edge-layer
-- cache features: Workers Cache, ESI, Regional Caching, Smart Edge
-- Revalidation, Tiered Cache, and Origin Shield.
--
-- The api_token column is intentionally excluded from any SELECT *
-- result that reaches the browser — the GET and PUT route handlers
-- strip it and return api_token_set + api_token_preview instead.
-- Only the sync route reads it directly to call Cloudflare's API.
--
-- RLS: admin-only read+write (mirrors cdn_cache_settings). The row
-- can hold a live Cloudflare API token so it must never be readable
-- by anonymous or authenticated-but-non-admin users.

create table if not exists edge_cache_settings (
  id                          boolean primary key default true,
  check (id),                 -- enforces single-row

  -- Cloudflare connection (separate from cdn_cache_settings — same
  -- zone credentials, different feature scope)
  zone_id                     text,
  api_token                   text,           -- never returned to client
  api_token_preview           text,           -- last 4 chars, e.g. "…a91f"
  connected_zone_name         text,

  -- 1. Workers Cache
  workers_enabled             boolean         not null default false,
  workers_cache_ttl_seconds   integer         not null default 300,
  workers_passthrough_enabled boolean         not null default true,
  workers_bypass_routes       text[]          not null default '{}',

  -- 2. Edge Side Includes (ESI)
  esi_enabled                 boolean         not null default false,
  esi_max_age_seconds         integer         not null default 300,
  esi_fail_open               boolean         not null default true,

  -- 3. Regional Caching
  regional_caching_enabled    boolean         not null default false,
  regional_caching_topology   text            not null default 'smart'
    check (regional_caching_topology in ('all', 'smart', 'custom')),
  restricted_regions          text[]          not null default '{}',

  -- 4. Smart Edge Revalidation
  smart_revalidation_enabled  boolean         not null default false,
  stale_while_revalidate_seconds integer      not null default 60,
  stale_if_error_seconds      integer         not null default 300,
  serve_stale_on_error        boolean         not null default false,

  -- 5. Tiered Cache
  tiered_cache_enabled        boolean         not null default false,
  tiered_cache_topology       text            not null default 'smart'
    check (tiered_cache_topology in ('smart', 'generic_global', 'generic_regional')),

  -- 6. Origin Shield (optional)
  origin_shield_enabled       boolean         not null default false,
  origin_shield_region        text            not null default 'iad',

  -- Sync tracking
  last_synced_at              timestamptz,
  last_sync_status            text
    check (last_sync_status in ('success', 'partial', 'failed')),
  last_sync_summary           jsonb,

  updated_at                  timestamptz     not null default now(),
  updated_by                  uuid            references auth.users(id) on delete set null
);

-- Seed the single row so GET requests always find a record.
insert into edge_cache_settings (id)
values (true)
on conflict (id) do nothing;

-- ── Row-Level Security ────────────────────────────────────────────────────────
alter table edge_cache_settings enable row level security;

-- Admin-only read
create policy "edge_cache_settings_select_admin"
  on edge_cache_settings for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.is_admin = true
    )
  );

-- Admin-only write
create policy "edge_cache_settings_update_admin"
  on edge_cache_settings for update
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.is_admin = true
    )
  );

-- Admin-only insert (for the on-conflict seed path)
create policy "edge_cache_settings_insert_admin"
  on edge_cache_settings for insert
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.is_admin = true
    )
  );
