-- MofiGames — Phase 49: Preloading & Prefetching, Admin → Cache.
--
-- Six features, four new tables — DNS Prefetch and Preconnect are *not*
-- duplicated here: they already have a real, working home as the
-- "Browser DNS Cache" pillar of Admin → Cache → DNS Cache (see migration
-- 0042b_dns_cache.sql, dns_prefetch_settings). This section's admin page
-- links out to that page instead of re-implementing the same two
-- columns under a second table, which would leave two sources of truth
-- for the same <link> tags. The four genuinely new pillars:
--
--   1. Cache Preloading   — server-side. Proactively fetches a configured
--      list of paths against the live site (see src/lib/cache-preload.ts)
--      so Full Page Cache / CDN Edge Cache / Fragment Cache are already
--      warm before a real visitor is the one paying for the first,
--      uncached render. Admin-only — nothing here is rendered to a
--      visitor, so it follows the stricter pattern used by
--      cdn_cache_settings / session_cache_settings rather than the
--      publicly-readable one below.
--   2. Resource Hints     — <link rel="preload"> for specific
--      admin-listed critical assets (a hero font, an above-the-fold
--      image, critical CSS/JS) rendered in the root layout for every
--      visitor. Distinct from Static Asset Cache (0042_static_asset_cache,
--      which sets Cache-Control *headers* per asset type) and from Image
--      Cache (which handles transcoding/responsive variants) — this is
--      purely "tell the browser to start fetching this exact URL early."
--   3. Link Prefetch      — client-side behaviour, not a stored resource
--      list: hovering (or scrolling near, or just landing on the page,
--      depending on strategy) a same-origin link calls the Next.js
--      router's own prefetch() ahead of an actual click. Publicly
--      readable so the behaviour-only client component
--      (src/components/LinkPrefetchController.tsx) can read its
--      strategy/exclusions without an admin session.
--   4. Speculative Loading — the browser Speculation Rules API
--      (<script type="speculationrules">): prefetches or fully
--      prerenders same-origin URLs matching admin-configured patterns,
--      well past what dns-prefetch/preconnect/link-prefetch do. Off by
--      default — prerendering has real side effects (analytics firing,
--      form state, non-idempotent GETs) if pointed at the wrong URLs, so
--      this is deliberately opt-in rather than defaulting on like the
--      lighter-weight hints above it.
--
-- Run in Supabase SQL Editor. Safe to run multiple times.

-- ── 1. Cache Preloading — admin-only ────────────────────────────────────────

create table if not exists public.cache_preload_settings (
  id boolean primary key default true,

  enabled boolean not null default true,

  -- Relative paths (leading slash), fetched against SITE_URL. Kept
  -- deliberately small by default — this is meant for the handful of
  -- pages that matter most on a cold cache (home, top listing pages),
  -- not a full-site crawl.
  preload_urls text[] not null default array['/', '/games', '/categories'],

  -- Bounded worker pool — see runCachePreload() in src/lib/cache-preload.ts.
  concurrency integer not null default 5
    check (concurrency between 1 and 20),
  request_timeout_ms integer not null default 8000
    check (request_timeout_ms between 1000 and 30000),

  -- Bookkeeping for both the manual "Preload Now" button here and the
  -- scheduled Automation → Infra → Cache Preloading job — one history,
  -- shared by both triggers (see runCachePreload()).
  last_run_at timestamptz,
  last_run_status text check (last_run_status in ('success', 'partial', 'failed')),
  last_run_summary jsonb,

  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint cache_preload_settings_single_row check (id)
);

insert into public.cache_preload_settings (id) values (true) on conflict (id) do nothing;

alter table public.cache_preload_settings enable row level security;

drop policy if exists "Admins can view cache preload settings" on public.cache_preload_settings;
create policy "Admins can view cache preload settings"
  on public.cache_preload_settings for select
  using (public.is_admin());

drop policy if exists "Admins can update cache preload settings" on public.cache_preload_settings;
create policy "Admins can update cache preload settings"
  on public.cache_preload_settings for update
  using (public.is_admin())
  with check (public.is_admin());

-- ── 2. Resource Hints — publicly readable ───────────────────────────────────

create table if not exists public.resource_hint_settings (
  id boolean primary key default true,

  enabled boolean not null default true,

  -- One JSON object per hint: { href, as, type?, crossorigin?, fetchPriority? }.
  -- Validated shape lives in src/lib/validation-resource-hints.ts; the
  -- mapper in src/lib/resource-hint-settings.ts re-sanitizes on the way
  -- out regardless, the same "never trust the row blindly" stance
  -- dns-prefetch-settings.ts takes with its domain list.
  hints jsonb not null default '[]'::jsonb,

  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint resource_hint_settings_single_row check (id)
);

insert into public.resource_hint_settings (id) values (true) on conflict (id) do nothing;

alter table public.resource_hint_settings enable row level security;

-- Publicly readable: the root layout renders these as <link rel="preload">
-- tags for every visitor, signed in or not — same reasoning as
-- dns_prefetch_settings (0042).
drop policy if exists "Resource hint settings are publicly readable" on public.resource_hint_settings;
create policy "Resource hint settings are publicly readable"
  on public.resource_hint_settings for select
  using (true);

drop policy if exists "Admins can update resource hint settings" on public.resource_hint_settings;
create policy "Admins can update resource hint settings"
  on public.resource_hint_settings for update
  using (public.is_admin())
  with check (public.is_admin());

-- ── 3. Link Prefetch — publicly readable ────────────────────────────────────

create table if not exists public.link_prefetch_settings (
  id boolean primary key default true,

  enabled boolean not null default true,
  strategy text not null default 'hover'
    check (strategy in ('hover', 'viewport', 'eager', 'disabled')),
  hover_delay_ms integer not null default 65
    check (hover_delay_ms between 0 and 2000),
  max_concurrent_prefetches integer not null default 4
    check (max_concurrent_prefetches between 1 and 20),

  -- Path prefixes that should never be speculatively prefetched
  -- (destructive/stateful routes, admin, API).
  exclude_patterns text[] not null default array['/admin', '/api', '/account', '/checkout'],

  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint link_prefetch_settings_single_row check (id)
);

insert into public.link_prefetch_settings (id) values (true) on conflict (id) do nothing;

alter table public.link_prefetch_settings enable row level security;

-- Publicly readable: src/components/LinkPrefetchController.tsx is a
-- client component mounted for every visitor and reads this directly.
drop policy if exists "Link prefetch settings are publicly readable" on public.link_prefetch_settings;
create policy "Link prefetch settings are publicly readable"
  on public.link_prefetch_settings for select
  using (true);

drop policy if exists "Admins can update link prefetch settings" on public.link_prefetch_settings;
create policy "Admins can update link prefetch settings"
  on public.link_prefetch_settings for update
  using (public.is_admin())
  with check (public.is_admin());

-- ── 4. Speculative Loading — publicly readable ──────────────────────────────

create table if not exists public.speculative_loading_settings (
  id boolean primary key default true,

  -- Off by default — see the header comment on why this is more
  -- cautious than the other three pillars.
  enabled boolean not null default false,
  mode text not null default 'prefetch'
    check (mode in ('prefetch', 'prerender')),
  eagerness text not null default 'moderate'
    check (eagerness in ('conservative', 'moderate', 'eager', 'immediate')),

  include_patterns text[] not null default array['/games/*'],
  exclude_patterns text[] not null default array['/admin/*', '/account/*', '/api/*', '/checkout/*'],

  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint speculative_loading_settings_single_row check (id)
);

insert into public.speculative_loading_settings (id) values (true) on conflict (id) do nothing;

alter table public.speculative_loading_settings enable row level security;

-- Publicly readable: rendered as <script type="speculationrules"> in the
-- root layout (src/components/SpeculationRules.tsx) for every visitor —
-- nothing in the row is sensitive, just URL patterns already visible in
-- the page's own HTML.
drop policy if exists "Speculative loading settings are publicly readable" on public.speculative_loading_settings;
create policy "Speculative loading settings are publicly readable"
  on public.speculative_loading_settings for select
  using (true);

drop policy if exists "Admins can update speculative loading settings" on public.speculative_loading_settings;
create policy "Admins can update speculative loading settings"
  on public.speculative_loading_settings for update
  using (public.is_admin())
  with check (public.is_admin());

-- ── Automation: register Cache Preloading as a schedulable Infra job ───────
-- Mirrors auto_cache_purge / auto_cdn_cache_purge (0016_automation.sql) —
-- runnable on its own schedule from Admin → Automation → Infra, in
-- addition to the manual "Preload Now" button on this page. See
-- src/lib/automation/infra-executors.ts (cachePreload) and registry.ts.

insert into public.automation_jobs (key, name, category, description, schedule_cron, config)
values (
  'cache_preload', 'Cache Preloading', 'Infra',
  'Warms the configured URLs against the live site so real visitors hit a warm cache instead of triggering the first render.',
  '0 */4 * * *', '{}'
)
on conflict (key) do nothing;
