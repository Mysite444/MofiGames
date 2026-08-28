-- Mofigames — Migration 0041: Image Cache Settings
-- Admin → Cache → Image Cache (Phase 9 of the Cache build-out).
-- Previous phases:
--   0033 Browser Cache      0034 CDN / Edge Cache     0035 Full Page Cache
--   0036 Object Cache       0037 Database Optimisation 0038 PHP OPcache
--   0039 Fragment Cache     0040 API Cache
--
-- "Image Cache" consolidates all image-optimisation concerns into a single
-- settings row. Seven capabilities are configured here:
--
--   1. WebP Generation        – transcode uploads to WebP at save time;
--      quality + minimum size-saving threshold; optional original preservation.
--
--   2. AVIF Generation        – transcode uploads to AVIF (smaller, slower);
--      quality + encoding effort (0–10); optional original preservation.
--
--   3. Responsive Images      – emit srcset width descriptors so browsers
--      download only the size they need; JSONB breakpoint array; optional
--      <picture> element for format negotiation; configurable sizes="" hint.
--
--   4. Thumbnail Cache        – persist generated thumbnails to disk or an
--      S3-compatible object store; per-image variant cap with LRU eviction;
--      configurable TTL.
--
--   5. Lazy Loading           – loading="lazy" native + IntersectionObserver
--      strategy; rootMargin + threshold; LQIP toggle; placeholder colour.
--
--   6. Image Optimisation Cache – Cache-Control max-age + SWR headers on
--      /api/image responses so CDN / browser serve repeats without hitting
--      the Next.js image pipeline; optional Vary: Accept for format buckets.
--
--   7. Image Resizing Cache   – in-process LRU keyed on (src, w, h, quality);
--      max entry count; configurable default fit + quality; per-dimension
--      upper bound to reject abusive resize requests.
--
-- Run in the Supabase SQL Editor. Safe to run multiple times (idempotent).

create table if not exists public.image_cache_settings (
  id boolean primary key default true,
  constraint image_cache_settings_single_row check (id),

  -- ── Master switch ──────────────────────────────────────────────────────────
  enabled boolean not null default false,

  -- ── 1. WebP Generation ────────────────────────────────────────────────────
  webp_enabled         boolean not null default true,
  webp_quality         int     not null default 80
    check (webp_quality between 1 and 100),
  -- Preserve original format alongside the WebP transcode.
  webp_keep_original   boolean not null default true,
  -- Minimum fractional file-size saving (0.0–1.0) required to keep the WebP;
  -- if the encoded file is not at least (threshold × 100)% smaller than the
  -- source the original is served instead. 0.0 = always use WebP.
  webp_size_threshold  numeric(4,3) not null default 0.050
    check (webp_size_threshold between 0 and 1),

  -- ── 2. AVIF Generation ────────────────────────────────────────────────────
  avif_enabled        boolean not null default false,
  avif_quality        int     not null default 60
    check (avif_quality between 1 and 100),
  avif_keep_original  boolean not null default true,
  -- Encoding effort 0–10: higher = smaller file, slower encode.
  avif_effort         int     not null default 4
    check (avif_effort between 0 and 10),

  -- ── 3. Responsive Images ──────────────────────────────────────────────────
  responsive_enabled      boolean not null default false,
  -- JSONB array of { width: number, density: 1|2|3 } breakpoints.
  -- Sorted ascending by width; density > 1 emits e.g. "640w 2x" descriptors.
  srcset_breakpoints jsonb not null default '[
    {"width":320,  "density":1},
    {"width":640,  "density":1},
    {"width":768,  "density":1},
    {"width":1024, "density":1},
    {"width":1280, "density":1},
    {"width":1920, "density":1}
  ]'::jsonb,
  -- Emit a <picture> element wrapping each <img> so AVIF / WebP versions are
  -- selected via <source type="image/avif"> / <source type="image/webp">.
  picture_element_enabled boolean not null default true,
  -- sizes="" hint written into generated <img> markup.
  sizes_attribute text not null default '(max-width: 768px) 100vw, 50vw'
    check (char_length(sizes_attribute) <= 256),

  -- ── 4. Thumbnail Cache ────────────────────────────────────────────────────
  thumbnail_cache_enabled  boolean not null default false,
  -- TTL in seconds for cached thumbnails (0–7 days).
  thumbnail_cache_ttl      int     not null default 86400
    check (thumbnail_cache_ttl between 0 and 604800),
  -- 'disk' writes to /public/cache/thumbs; 'object-store' writes to the
  -- configured S3-compatible bucket (requires OBJECT_STORE_* env vars).
  thumbnail_storage_driver text    not null default 'disk'
    check (thumbnail_storage_driver in ('disk', 'object-store')),
  -- Max number of dimension variants kept per source image. Older variants
  -- are evicted LRU-style when this limit is reached.
  thumbnail_max_variants   int     not null default 20
    check (thumbnail_max_variants between 1 and 200),

  -- ── 5. Lazy Loading ───────────────────────────────────────────────────────
  lazy_load_enabled     boolean not null default true,
  -- 'native' = loading="lazy"; 'observer' = IntersectionObserver only;
  -- 'both' = native attribute + Observer for maximum browser compatibility.
  lazy_load_strategy    text    not null default 'both'
    check (lazy_load_strategy in ('native', 'observer', 'both')),
  -- IntersectionObserver rootMargin, e.g. "200px 0px".
  lazy_load_root_margin text    not null default '200px 0px'
    check (char_length(lazy_load_root_margin) <= 64),
  -- IntersectionObserver threshold fraction (0.0–1.0).
  lazy_load_threshold   numeric(4,3) not null default 0.000
    check (lazy_load_threshold between 0 and 1),
  -- Show a Base64 LQIP placeholder while the full image loads.
  lqip_enabled          boolean not null default false,
  -- CSS colour string used as the placeholder background when LQIP is off.
  placeholder_color     text    not null default '#1a1a2e'
    check (char_length(placeholder_color) <= 32),

  -- ── 6. Image Optimisation Cache ───────────────────────────────────────────
  optimisation_cache_enabled boolean not null default false,
  -- Cache-Control max-age for /api/image responses (0–7 days).
  optimisation_cache_ttl     int     not null default 3600
    check (optimisation_cache_ttl between 0 and 604800),
  -- stale-while-revalidate window (0–1 hour). 0 disables SWR.
  optimisation_cache_swr     int     not null default 60
    check (optimisation_cache_swr between 0 and 3600),
  -- Adds Vary: Accept so CDN edges keep WebP and JPEG/PNG in separate buckets.
  vary_by_accept             boolean not null default true,

  -- ── 7. Image Resizing Cache ───────────────────────────────────────────────
  resizing_cache_enabled     boolean not null default false,
  -- TTL for resized variants (0–7 days).
  resizing_cache_ttl         int     not null default 86400
    check (resizing_cache_ttl between 0 and 604800),
  -- Max LRU entries. Eviction runs when this count is exceeded.
  resizing_cache_max_entries int     not null default 5000
    check (resizing_cache_max_entries between 100 and 50000),
  -- Default sharp fit mode used when the caller omits the parameter.
  default_fit                text    not null default 'cover'
    check (default_fit in ('cover', 'contain', 'fill', 'inside', 'outside')),
  -- Default output quality when the caller omits the parameter.
  default_quality            int     not null default 80
    check (default_quality between 1 and 100),
  -- Upper bounds on resize dimensions — requests exceeding these are rejected.
  max_resize_width           int     not null default 3840
    check (max_resize_width  between 16 and 8192),
  max_resize_height          int     not null default 3840
    check (max_resize_height between 16 and 8192),

  -- ── Diagnostics ───────────────────────────────────────────────────────────
  last_purged_at  timestamptz,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id) on delete set null
);

-- Seed the singleton row so the admin UI always has something to read.
insert into public.image_cache_settings (id)
values (true)
on conflict (id) do nothing;

-- ── Row-Level Security ────────────────────────────────────────────────────────

alter table public.image_cache_settings enable row level security;

-- Admin users may read and write.
create policy "Admins can read image cache settings"
  on public.image_cache_settings
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

create policy "Admins can update image cache settings"
  on public.image_cache_settings
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Singleton table — primary key index is all that's needed.
-- The srcset_breakpoints JSONB column is read-only from the admin UI so no
-- GIN index is required for this table's access pattern.
