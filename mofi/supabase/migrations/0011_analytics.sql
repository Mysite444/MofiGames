-- MofiGames — Phase 11: Analytics.
-- Adds a new Admin → Analytics section: Overview, Game & Category
-- Analytics, User & Search Analytics, and Content Health — all computed
-- from data this app actually collects. Also adds a place to connect
-- external analytics (Google Analytics 4, Microsoft Clarity) — Search
-- Console verification already exists (seo_settings.google_site_verification,
-- migration 0010), so it isn't duplicated here.
-- Run in Supabase SQL Editor. Safe to run multiple times.

-- ---------------------------------------------------------------------------
-- page_views — one row per page load. Powers visitor counts (today/7d/
-- 30d/total), "online now", device/browser/OS breakdowns, and traffic
-- sources (referrer). `visitor_id` is a random id the browser sets in a
-- long-lived cookie (see src/components/AnalyticsTracker.tsx) — it's the
-- unit "unique visitor" counts dedupe on, not user_id, since most traffic
-- is signed-out.
-- ---------------------------------------------------------------------------
create table if not exists public.page_views (
  id uuid primary key default gen_random_uuid(),
  path text not null,
  referrer text,
  visitor_id text not null,
  user_id uuid references auth.users (id) on delete set null,
  device_type text not null default 'desktop' check (device_type in ('desktop', 'mobile', 'tablet')),
  browser text not null default 'Other',
  os text not null default 'Other',
  created_at timestamptz not null default now()
);

create index if not exists page_views_created_at_idx on public.page_views (created_at desc);
create index if not exists page_views_visitor_id_idx on public.page_views (visitor_id);
create index if not exists page_views_path_idx on public.page_views (path);

alter table public.page_views enable row level security;

-- Anyone can log a pageview (including signed-out visitors) — write-only
-- from the outside, nothing to leak. Only admins can read the log back.
drop policy if exists "Anyone can record a page view" on public.page_views;
create policy "Anyone can record a page view"
  on public.page_views for insert
  with check (true);

drop policy if exists "Admins can read page views" on public.page_views;
create policy "Admins can read page views"
  on public.page_views for select
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- search_queries — one row per search performed in the site search box.
-- Powers Search Analytics (top keywords, searches with no results).
-- ---------------------------------------------------------------------------
create table if not exists public.search_queries (
  id uuid primary key default gen_random_uuid(),
  query text not null check (char_length(btrim(query)) between 1 and 200),
  results_count integer not null default 0,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists search_queries_created_at_idx on public.search_queries (created_at desc);
create index if not exists search_queries_query_idx on public.search_queries (lower(query));

alter table public.search_queries enable row level security;

drop policy if exists "Anyone can record a search" on public.search_queries;
create policy "Anyone can record a search"
  on public.search_queries for insert
  with check (true);

drop policy if exists "Admins can read search queries" on public.search_queries;
create policy "Admins can read search queries"
  on public.search_queries for select
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- game_plays — event log backing `games.plays` (which stays a running
-- counter for fast reads elsewhere in the app). Needed because a single
-- counter can't answer "plays today" / "trending this week" — only a
-- timestamped row per play can. Insert-only via increment_game_plays()
-- below (SECURITY DEFINER), same narrow-write pattern as `games.plays`
-- itself — there is deliberately no public insert policy here.
-- ---------------------------------------------------------------------------
create table if not exists public.game_plays (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  slug text not null,
  created_at timestamptz not null default now()
);

create index if not exists game_plays_created_at_idx on public.game_plays (created_at desc);
create index if not exists game_plays_game_id_idx on public.game_plays (game_id, created_at desc);

alter table public.game_plays enable row level security;

drop policy if exists "Admins can read game plays" on public.game_plays;
create policy "Admins can read game plays"
  on public.game_plays for select
  using (public.is_admin());

-- Re-create increment_game_plays (from migration 0004) to also append a
-- log row, so every future play is timestamped without changing the
-- function's signature or any of its callers.
create or replace function public.increment_game_plays(game_slug text)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_game_id uuid;
  new_plays integer;
begin
  update public.games
  set plays = plays + 1
  where slug = game_slug and is_published = true
  returning id, plays into v_game_id, new_plays;

  if v_game_id is not null then
    insert into public.game_plays (game_id, slug) values (v_game_id, game_slug);
  end if;

  return new_plays;
end;
$$;

grant execute on function public.increment_game_plays(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- analytics_settings — singleton row (same pattern as seo_settings,
-- migration 0010). Backs Admin → Analytics → Connect Integrations. This
-- app never calls the GA4/GSC/Clarity reporting APIs itself (that needs
-- OAuth credentials only the site owner can create) — it just stores the
-- public IDs needed to (a) inject the GA4 + Clarity tracking scripts on
-- every page and (b) show a clear "connected / not connected" status in
-- the admin panel. Search Console verification reuses the existing
-- seo_settings.google_site_verification field rather than duplicating it.
-- ---------------------------------------------------------------------------
create table if not exists public.analytics_settings (
  id boolean primary key default true,

  ga4_measurement_id text not null default '',
  ga4_property_id text not null default '',

  gsc_site_url text not null default '',

  clarity_project_id text not null default '',

  updated_at timestamptz not null default now(),

  constraint analytics_settings_singleton check (id)
);

insert into public.analytics_settings (id) values (true) on conflict (id) do nothing;

alter table public.analytics_settings enable row level security;

-- Publicly readable (the tracking-script injector in the root layout runs
-- on every public page, unauthenticated) — write is admin-only.
drop policy if exists "Analytics settings are publicly readable" on public.analytics_settings;
create policy "Analytics settings are publicly readable"
  on public.analytics_settings for select
  using (true);

drop policy if exists "Admins can manage analytics settings" on public.analytics_settings;
create policy "Admins can manage analytics settings"
  on public.analytics_settings for all
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists analytics_settings_set_updated_at on public.analytics_settings;
create trigger analytics_settings_set_updated_at
  before update on public.analytics_settings
  for each row execute function public.set_updated_at();
