-- Mofigames — Migration 0048: Media Cache (Admin → Cache → Media Cache).
--
-- Five media-caching pillars, one singleton settings row:
--   1. Videos        — long-form video files; HTTP range request support
--                      so clients can seek without re-fetching from byte 0.
--   2. Audio         — audio tracks and SFX; same range-request concern as
--                      video applies to the Web Audio API and <audio> seek.
--   3. Game Previews — short animated clips / GIFs shown on game cards;
--                      eager-load and autoplay-on-hover toggles live here.
--   4. Loading Screens — assets displayed while the game engine initialises;
--                      rarely change so they're eligible for very long TTLs
--                      (up to 1 year); prefetch toggle fires when the user
--                      navigates to the game page.
--   5. Screenshots   — gallery and thumbnail images; lazy-load and
--                      optional WebP transcode at serve time.
--
-- Unlike feed_cache_settings / dns_prefetch_settings, this table holds no
-- public-facing cache-policy values (the media files themselves get their
-- Cache-Control from the CDN / storage bucket, not from this row), so RLS
-- follows the stricter admin-only pattern used by cdn_cache_settings,
-- edge_cache_settings, and analytics_cache_settings.
--
-- Run in Supabase SQL Editor. Safe to run multiple times.

create table if not exists public.media_cache_settings (
  id boolean primary key default true,
  constraint media_cache_settings_single_row check (id),

  -- ── Master switch ──────────────────────────────────────────────────────────
  enabled boolean not null default false,

  -- ── 1. Videos ─────────────────────────────────────────────────────────────
  videos_enabled               boolean not null default true,
  videos_cache_ttl_seconds     integer not null default 86400        -- 1 day
    check (videos_cache_ttl_seconds between 300 and 604800),
  videos_swr_seconds           integer not null default 3600         -- 1 hour
    check (videos_swr_seconds between 0 and 86400),
  videos_range_requests_enabled boolean not null default true,
  videos_cdn_offload_enabled   boolean not null default true,
  videos_max_file_size_mb      integer not null default 500          -- 500 MB
    check (videos_max_file_size_mb between 1 and 5000),
  videos_last_purged_at        timestamptz,

  -- ── 2. Audio ──────────────────────────────────────────────────────────────
  audio_enabled                boolean not null default true,
  audio_cache_ttl_seconds      integer not null default 86400        -- 1 day
    check (audio_cache_ttl_seconds between 300 and 604800),
  audio_swr_seconds            integer not null default 3600
    check (audio_swr_seconds between 0 and 86400),
  audio_range_requests_enabled boolean not null default true,
  audio_cdn_offload_enabled    boolean not null default true,
  audio_max_file_size_mb       integer not null default 100          -- 100 MB
    check (audio_max_file_size_mb between 1 and 2000),
  audio_last_purged_at         timestamptz,

  -- ── 3. Game Previews ──────────────────────────────────────────────────────
  previews_enabled             boolean not null default true,
  previews_cache_ttl_seconds   integer not null default 604800       -- 7 days
    check (previews_cache_ttl_seconds between 300 and 2592000),
  previews_swr_seconds         integer not null default 86400        -- 1 day
    check (previews_swr_seconds between 0 and 86400),
  previews_cdn_offload_enabled boolean not null default true,
  previews_eager_load_enabled  boolean not null default true,
  previews_autoplay_on_hover   boolean not null default true,
  previews_last_purged_at      timestamptz,

  -- ── 4. Loading Screens ────────────────────────────────────────────────────
  loading_screens_enabled              boolean not null default true,
  loading_screens_cache_ttl_seconds    integer not null default 2592000  -- 30 days
    check (loading_screens_cache_ttl_seconds between 3600 and 31536000),
  loading_screens_swr_seconds          integer not null default 86400
    check (loading_screens_swr_seconds between 0 and 604800),
  loading_screens_cdn_offload_enabled  boolean not null default true,
  loading_screens_prefetch_enabled     boolean not null default true,
  loading_screens_last_purged_at       timestamptz,

  -- ── 5. Screenshots ────────────────────────────────────────────────────────
  screenshots_enabled              boolean not null default true,
  screenshots_cache_ttl_seconds    integer not null default 604800    -- 7 days
    check (screenshots_cache_ttl_seconds between 3600 and 2592000),
  screenshots_swr_seconds          integer not null default 86400
    check (screenshots_swr_seconds between 0 and 86400),
  screenshots_cdn_offload_enabled  boolean not null default true,
  screenshots_lazy_load_enabled    boolean not null default true,
  screenshots_webp_convert_enabled boolean not null default false,
  screenshots_last_purged_at       timestamptz,

  -- ── Diagnostics ───────────────────────────────────────────────────────────
  last_purged_at  timestamptz,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users (id) on delete set null
);

-- Seed the singleton row if it doesn't already exist.
insert into public.media_cache_settings (id)
values (true)
on conflict (id) do nothing;

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.media_cache_settings enable row level security;

-- Admin-only read + write (same as cdn_cache_settings / edge_cache_settings).
-- Nothing in this row needs to be read by anonymous requests at runtime, so
-- there's no reason to make it publicly readable.
drop policy if exists "Admins can read media cache settings"  on public.media_cache_settings;
create policy "Admins can read media cache settings"
  on public.media_cache_settings for select
  using (public.is_admin());

drop policy if exists "Admins can update media cache settings" on public.media_cache_settings;
create policy "Admins can update media cache settings"
  on public.media_cache_settings for update
  using  (public.is_admin())
  with check (public.is_admin());
