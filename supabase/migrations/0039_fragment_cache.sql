-- Mofigames — Migration 0039: Fragment Cache Settings
-- Admin → Cache → Fragment Cache (Phase 7 of the Cache build-out. Phase 1
-- was 0033 Browser Cache, Phase 2 was 0034 CDN / Edge Cache, Phase 3 was
-- 0035 Full Page Cache, Phase 4 was 0036 Object Cache, Phase 5 was 0037
-- Database Optimisation, Phase 6 was 0038 PHP OPcache).
--
-- "Fragment cache" sits one level below Full Page Cache (0035): instead of
-- caching an entire rendered response, it caches the output of individual
-- expensive *sections* of a page — a trending-games rail, a related-games
-- grid, the nav menu — independently, each with its own TTL, so a page
-- that mixes cheap and expensive sections doesn't have to cache (or
-- invalidate) all of it as one unit. Unlike Object Cache (0036), which is
-- a generic external key-value store, this is scoped specifically to the
-- named, known-expensive sections listed below and is served from this
-- app's own process (see src/lib/fragment-cache.ts) rather than an
-- external Redis/Memcached instance — no credentials to store here.
--
-- Run in Supabase SQL Editor. Safe to run multiple times.

create table if not exists public.fragment_cache_settings (
  id boolean primary key default true,
  constraint fragment_cache_settings_single_row check (id),

  -- Master switch. When off, every fragment is computed fresh on every
  -- request regardless of its own enabled flag below.
  enabled boolean not null default true,

  -- Applied to any fragment whose own row in `fragments` doesn't specify
  -- ttlSeconds (shouldn't normally happen — the seed below sets one for
  -- all eight — but keeps a malformed row from caching forever).
  default_ttl_seconds int not null default 300
    check (default_ttl_seconds between 5 and 86400),

  -- Upper bound on how many distinct cache entries the in-process store
  -- may hold at once (a fragment like "related-games" has one entry per
  -- category, not one total) — oldest-accessed entries are evicted once
  -- this is exceeded. Keeps an unbounded number of category/query variants
  -- from growing the Node process's memory indefinitely.
  max_entries int not null default 500
    check (max_entries between 20 and 20000),

  -- Once an entry expires, serve the stale value for up to this many
  -- seconds while a fresh value is computed in the background, instead of
  -- making the request that discovers the expiry pay for a synchronous
  -- recompute. 0 disables stale-while-revalidate (expired = always
  -- recompute inline).
  stale_while_revalidate_seconds int not null default 30
    check (stale_while_revalidate_seconds between 0 and 600),

  -- Signed-in admins previewing draft/unpublished content (games, pages)
  -- always bypass the fragment cache, so a draft never appears to a
  -- reviewer as missing because a stale published-only fragment served
  -- from cache. Regular visitors are unaffected either way.
  bypass_for_admins boolean not null default true,

  -- Reserved for the localization phase: when true, cache keys are
  -- namespaced per request locale instead of one shared entry for every
  -- language. Off by default since this app's fragments aren't yet
  -- locale-dependent — flipping it on is forward-compatible (existing
  -- entries just stop being shared, they aren't invalidated).
  vary_by_locale boolean not null default false,

  -- Per-fragment catalogue. Each element:
  --   { "key": string, "label": string, "ttlSeconds": number, "enabled": boolean }
  -- `key` is the stable identifier fragment-cache.ts and the wiring in
  -- games-server.ts / homepage-layout-server.ts / NavList.tsx key their
  -- cache entries on — do not rename an existing key without updating
  -- those call sites, or its stats will silently reset to zero.
  fragments jsonb not null default '[
    {"key": "trending-games",     "label": "Trending Games",     "ttlSeconds": 180,  "enabled": true},
    {"key": "featured-games",     "label": "Featured Games",     "ttlSeconds": 300,  "enabled": true},
    {"key": "related-games",      "label": "Related Games",      "ttlSeconds": 600,  "enabled": true},
    {"key": "navigation-menus",   "label": "Navigation Menus",   "ttlSeconds": 900,  "enabled": true},
    {"key": "footer-widgets",     "label": "Footer Widgets",     "ttlSeconds": 1800, "enabled": true},
    {"key": "sidebars",           "label": "Sidebars",           "ttlSeconds": 600,  "enabled": true},
    {"key": "game-cards",         "label": "Game Cards",         "ttlSeconds": 300,  "enabled": true},
    {"key": "homepage-sections",  "label": "Homepage Sections",  "ttlSeconds": 300,  "enabled": true}
  ]'::jsonb,

  -- ── Diagnostics ───────────────────────────────────────────────────────────
  -- Live hit/miss/entry counters live in process memory (fragment-cache.ts),
  -- not here — a DB round trip on every fragment read would defeat the
  -- purpose. Only the last purge action is persisted, same spirit as
  -- last_invalidated_at on object_cache_settings.
  last_purged_at timestamptz,
  last_purge_summary jsonb,

  -- Metadata
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.fragment_cache_settings (id)
  values (true)
  on conflict (id) do nothing;

alter table public.fragment_cache_settings enable row level security;

-- Publicly readable (not just admin-only) — unlike Object Cache, this row
-- holds no credentials or server topology, and the enabled/ttlSeconds
-- values need to be readable by the app's own request path (every fragment
-- read checks this row) long before any admin session exists, same
-- reasoning as cache_settings in 0033.
drop policy if exists "Fragment cache settings are publicly readable" on public.fragment_cache_settings;
create policy "Fragment cache settings are publicly readable"
  on public.fragment_cache_settings for select
  using (true);

drop policy if exists "Admins can update fragment cache settings" on public.fragment_cache_settings;
create policy "Admins can update fragment cache settings"
  on public.fragment_cache_settings for update
  using (public.is_admin())
  with check (public.is_admin());
