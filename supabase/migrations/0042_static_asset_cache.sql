-- Mofigames — Migration 0042: Static Asset Cache Settings
-- Admin → Cache → Static Asset Cache (Phase 10 of the Cache build-out).
-- Previous phases: 0033 Browser Cache, 0034 CDN / Edge Cache,
-- 0035 Full Page Cache, 0036 Object Cache, 0037 Database Optimisation,
-- 0038 PHP OPcache, 0039 Fragment Cache, 0040 API Cache, 0041 Image Cache.
--
-- "Static Asset Cache" gives each of seven static-asset families its own
-- Cache-Control policy. This is distinct from Browser Cache's versioned
-- Storage buckets (0033), which cover user-uploaded content stamped with an
-- upload timestamp. This table covers the site's own static assets served
-- from /public and custom asset pipelines — CSS, JavaScript, fonts, SVG,
-- icons, videos, and audio — most of which are NOT automatically
-- content-hashed the way the Next.js /_next/static build output is.
--
--   1. CSS        – stylesheet Cache-Control + CDN edge TTL.
--   2. JavaScript – script Cache-Control + CDN edge TTL.
--   3. Fonts      – long-lived Cache-Control, preload hints, font-display,
--      and a cross-origin header (required for cross-origin @font-face).
--   4. SVG        – Cache-Control, optional sprite-sheet bundling, and an
--      inline-as-data-URI threshold for small icons.
--   5. Icons      – favicons / PWA / app icons, with optional filename
--      fingerprinting so an update isn't stuck behind a long TTL.
--   6. Videos     – Cache-Control + HTTP Range request support for
--      scrubbing, plus a preload hint.
--   7. Audio      – Cache-Control + HTTP Range request support for
--      seeking, plus a preload hint.
--
-- Run in the Supabase SQL Editor. Safe to run multiple times (idempotent).

create table if not exists public.static_asset_cache_settings (
  id boolean primary key default true,
  constraint static_asset_cache_settings_single_row check (id),

  -- ── Master switch ──────────────────────────────────────────────────────────
  enabled boolean not null default false,

  -- ── 1. CSS ─────────────────────────────────────────────────────────────────
  css_enabled                boolean not null default true,
  css_max_age                int     not null default 31536000
    check (css_max_age between 0 and 31536000),
  css_cdn_max_age             int     not null default 31536000
    check (css_cdn_max_age between 0 and 31536000),
  css_stale_while_revalidate  int     not null default 86400
    check (css_stale_while_revalidate between 0 and 2592000),
  css_immutable               boolean not null default true,
  css_compression_enabled     boolean not null default true,

  -- ── 2. JavaScript ──────────────────────────────────────────────────────────
  javascript_enabled               boolean not null default true,
  javascript_max_age               int     not null default 31536000
    check (javascript_max_age between 0 and 31536000),
  javascript_cdn_max_age           int     not null default 31536000
    check (javascript_cdn_max_age between 0 and 31536000),
  javascript_stale_while_revalidate int    not null default 86400
    check (javascript_stale_while_revalidate between 0 and 2592000),
  javascript_immutable             boolean not null default true,
  javascript_compression_enabled   boolean not null default true,

  -- ── 3. Fonts ───────────────────────────────────────────────────────────────
  fonts_enabled               boolean not null default true,
  fonts_max_age                int     not null default 31536000
    check (fonts_max_age between 0 and 31536000),
  fonts_cdn_max_age            int     not null default 31536000
    check (fonts_cdn_max_age between 0 and 31536000),
  fonts_stale_while_revalidate int    not null default 604800
    check (fonts_stale_while_revalidate between 0 and 2592000),
  fonts_immutable              boolean not null default true,
  fonts_compression_enabled    boolean not null default true,
  -- Emit <link rel="preload" as="font"> for above-the-fold fonts.
  fonts_preload_enabled        boolean not null default true,
  -- CSS font-display value written into the @font-face rule.
  fonts_font_display            text    not null default 'swap'
    check (fonts_font_display in ('auto', 'block', 'swap', 'fallback', 'optional')),
  -- Adds crossorigin="anonymous" / Access-Control-Allow-Origin — required
  -- whenever fonts are served from a different origin than the page.
  fonts_cross_origin_enabled    boolean not null default true,

  -- ── 4. SVG ─────────────────────────────────────────────────────────────────
  svg_enabled               boolean not null default true,
  svg_max_age                int     not null default 2592000
    check (svg_max_age between 0 and 31536000),
  svg_cdn_max_age            int     not null default 2592000
    check (svg_cdn_max_age between 0 and 31536000),
  svg_stale_while_revalidate int    not null default 86400
    check (svg_stale_while_revalidate between 0 and 2592000),
  svg_immutable              boolean not null default false,
  svg_compression_enabled    boolean not null default true,
  -- Bundle icon SVGs into a single cached sprite sheet instead of one
  -- request per icon.
  svg_sprite_enabled         boolean not null default false,
  -- SVGs at or under this size (bytes) are inlined as data: URIs instead of
  -- cached as separate network requests. 0 disables inlining.
  svg_inline_threshold_bytes int     not null default 4096
    check (svg_inline_threshold_bytes between 0 and 65536),

  -- ── 5. Icons ───────────────────────────────────────────────────────────────
  icons_enabled               boolean not null default true,
  icons_max_age                int     not null default 604800
    check (icons_max_age between 0 and 31536000),
  icons_cdn_max_age            int     not null default 604800
    check (icons_cdn_max_age between 0 and 31536000),
  icons_stale_while_revalidate int    not null default 86400
    check (icons_stale_while_revalidate between 0 and 2592000),
  icons_immutable              boolean not null default false,
  icons_compression_enabled    boolean not null default true,
  -- Append a content hash to favicon / app-icon filenames so an update
  -- busts the cache instead of waiting out the TTL.
  icons_fingerprint_enabled    boolean not null default false,

  -- ── 6. Videos ──────────────────────────────────────────────────────────────
  videos_enabled               boolean not null default true,
  videos_max_age                int     not null default 604800
    check (videos_max_age between 0 and 31536000),
  videos_cdn_max_age            int     not null default 2592000
    check (videos_cdn_max_age between 0 and 31536000),
  videos_stale_while_revalidate int    not null default 86400
    check (videos_stale_while_revalidate between 0 and 2592000),
  videos_immutable              boolean not null default false,
  -- Video files are already compressed; gzip/brotli buys nothing and costs
  -- CPU, so this defaults off unlike the text-based asset types above.
  videos_compression_enabled    boolean not null default false,
  -- Send Accept-Ranges: bytes and honour Range requests — required for
  -- seeking/scrubbing instead of downloading the whole file up front.
  videos_range_requests_enabled boolean not null default true,
  -- HTML5 preload attribute hint for <video> elements.
  videos_preload                text    not null default 'metadata'
    check (videos_preload in ('none', 'metadata', 'auto')),

  -- ── 7. Audio ───────────────────────────────────────────────────────────────
  audio_enabled               boolean not null default true,
  audio_max_age                int     not null default 604800
    check (audio_max_age between 0 and 31536000),
  audio_cdn_max_age            int     not null default 2592000
    check (audio_cdn_max_age between 0 and 31536000),
  audio_stale_while_revalidate int    not null default 86400
    check (audio_stale_while_revalidate between 0 and 2592000),
  audio_immutable              boolean not null default false,
  audio_compression_enabled    boolean not null default false,
  audio_range_requests_enabled boolean not null default true,
  audio_preload                text    not null default 'metadata'
    check (audio_preload in ('none', 'metadata', 'auto')),

  -- ── Diagnostics ────────────────────────────────────────────────────────────
  last_purged_at timestamptz,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users (id) on delete set null
);

-- Seed the singleton row so the admin UI always has something to read.
insert into public.static_asset_cache_settings (id)
values (true)
on conflict (id) do nothing;

-- ── Row-Level Security ───────────────────────────────────────────────────────

alter table public.static_asset_cache_settings enable row level security;

drop policy if exists "Admins can read static asset cache settings" on public.static_asset_cache_settings;
create policy "Admins can read static asset cache settings"
  on public.static_asset_cache_settings for select
  using (public.is_admin());

drop policy if exists "Admins can update static asset cache settings" on public.static_asset_cache_settings;
create policy "Admins can update static asset cache settings"
  on public.static_asset_cache_settings for update
  using (public.is_admin())
  with check (public.is_admin());

-- ── Indexes ──────────────────────────────────────────────────────────────────

-- Singleton table — the primary key index is all that's needed.
