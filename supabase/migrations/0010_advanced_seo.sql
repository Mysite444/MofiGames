-- MofiGames — Phase 10: Advanced SEO Module.
-- Implements the "Advanced SEO Module Specification" for Game Page SEO,
-- Category SEO, Tag SEO, Blog SEO, and Static Page SEO, plus the
-- site-wide SEO infrastructure (Global Settings, Sitemaps, robots.txt,
-- Redirects, Structured Data, Indexing Controls). Developer/Publisher SEO
-- is intentionally out of scope for this phase (no developer/publisher
-- pages exist yet).
-- Run in Supabase SQL Editor. Safe to run multiple times.

-- ---------------------------------------------------------------------------
-- games — Game Page SEO. `meta_title`/`meta_description` already exist
-- (migration 0008); everything else below is new. Published/Last-updated
-- dates are already covered by the existing created_at/updated_at columns,
-- so no new columns are needed for those.
-- ---------------------------------------------------------------------------
alter table public.games add column if not exists seo_canonical_url text;
alter table public.games add column if not exists seo_focus_keyword text not null default '';
alter table public.games add column if not exists seo_secondary_keywords text[] not null default '{}';
alter table public.games add column if not exists seo_h1_title text not null default '';
alter table public.games add column if not exists seo_excerpt text not null default '';
alter table public.games add column if not exists seo_author text not null default '';

-- Robots meta (index/noindex, follow/nofollow, snippet/preview limits).
alter table public.games add column if not exists seo_index boolean not null default true;
alter table public.games add column if not exists seo_follow boolean not null default true;
alter table public.games add column if not exists seo_max_snippet integer not null default -1;
alter table public.games add column if not exists seo_max_image_preview text not null default 'large';
alter table public.games add column if not exists seo_max_video_preview integer not null default -1;
alter table public.games add column if not exists seo_noarchive boolean not null default false;
alter table public.games add column if not exists seo_nosnippet boolean not null default false;

-- Open Graph.
alter table public.games add column if not exists og_title text not null default '';
alter table public.games add column if not exists og_description text not null default '';
alter table public.games add column if not exists og_image_url text;
alter table public.games add column if not exists og_image_alt text not null default '';

-- Twitter / X Card.
alter table public.games add column if not exists twitter_title text not null default '';
alter table public.games add column if not exists twitter_description text not null default '';
alter table public.games add column if not exists twitter_image_url text;
alter table public.games add column if not exists twitter_image_alt text not null default '';
alter table public.games add column if not exists twitter_card text not null default 'summary_large_image';

-- Structured data toggles — which JSON-LD schemas render on this game's
-- page. All auto-generated from existing game fields; these just let an
-- admin turn any of them off for a specific game (e.g. no Review schema
-- until real reviews exist).
alter table public.games add column if not exists schema_video_game boolean not null default true;
alter table public.games add column if not exists schema_software_application boolean not null default true;
alter table public.games add column if not exists schema_review boolean not null default false;
alter table public.games add column if not exists schema_breadcrumb boolean not null default true;

alter table public.games drop constraint if exists games_seo_max_image_preview_check;
alter table public.games add constraint games_seo_max_image_preview_check
  check (seo_max_image_preview in ('none', 'standard', 'large'));

alter table public.games drop constraint if exists games_twitter_card_check;
alter table public.games add constraint games_twitter_card_check
  check (twitter_card in ('summary', 'summary_large_image', 'app', 'player'));

-- ---------------------------------------------------------------------------
-- categories — Category SEO.
-- ---------------------------------------------------------------------------
alter table public.categories add column if not exists seo_title text not null default '';
alter table public.categories add column if not exists seo_description text not null default '';
alter table public.categories add column if not exists seo_canonical_url text;
alter table public.categories add column if not exists seo_focus_keyword text not null default '';
alter table public.categories add column if not exists seo_h1_title text not null default '';
alter table public.categories add column if not exists seo_index boolean not null default true;
alter table public.categories add column if not exists breadcrumbs_enabled boolean not null default true;
alter table public.categories add column if not exists schema_collection_page boolean not null default true;
alter table public.categories add column if not exists og_image_url text;

-- ---------------------------------------------------------------------------
-- tags — Tag SEO.
-- ---------------------------------------------------------------------------
alter table public.tags add column if not exists seo_title text not null default '';
alter table public.tags add column if not exists seo_description text not null default '';
alter table public.tags add column if not exists seo_canonical_url text;
alter table public.tags add column if not exists seo_h1_title text not null default '';
alter table public.tags add column if not exists seo_index boolean not null default true;

-- ---------------------------------------------------------------------------
-- posts — Blog SEO.
-- ---------------------------------------------------------------------------
alter table public.posts add column if not exists seo_title text not null default '';
alter table public.posts add column if not exists seo_description text not null default '';
alter table public.posts add column if not exists seo_canonical_url text;
alter table public.posts add column if not exists seo_focus_keyword text not null default '';
alter table public.posts add column if not exists seo_secondary_keywords text[] not null default '{}';
alter table public.posts add column if not exists seo_h1_title text not null default '';
alter table public.posts add column if not exists seo_index boolean not null default true;
alter table public.posts add column if not exists og_title text not null default '';
alter table public.posts add column if not exists og_description text not null default '';
alter table public.posts add column if not exists og_image_url text;
alter table public.posts add column if not exists og_image_alt text not null default '';
alter table public.posts add column if not exists twitter_card text not null default 'summary_large_image';

alter table public.posts drop constraint if exists posts_twitter_card_check;
alter table public.posts add constraint posts_twitter_card_check
  check (twitter_card in ('summary', 'summary_large_image', 'app', 'player'));

-- ---------------------------------------------------------------------------
-- pages — Static Page SEO (About, Contact, FAQ, Privacy, Terms, and any
-- custom page created through Admin → Pages).
-- ---------------------------------------------------------------------------
alter table public.pages add column if not exists seo_title text not null default '';
alter table public.pages add column if not exists seo_canonical_url text;
alter table public.pages add column if not exists seo_h1_title text not null default '';
alter table public.pages add column if not exists seo_index boolean not null default true;
alter table public.pages add column if not exists og_image_url text;

-- ---------------------------------------------------------------------------
-- seo_settings — a single global settings row (singleton via a boolean
-- primary key that only ever holds `true`). Backs Admin → SEO Management →
-- Global Settings: General, Search Engine Verification, Search Appearance
-- templates, Social Media defaults, robots.txt content, per-sitemap
-- enable/disable, and global Indexing Controls.
-- ---------------------------------------------------------------------------
create table if not exists public.seo_settings (
  id boolean primary key default true,

  -- General
  site_name text not null default 'MofiGames',
  title_template text not null default '%title% — %site_name%',
  default_meta_description text not null default
    'Hundreds of free browser games across action, racing, puzzle, sports and more. No download, just play.',
  default_author text not null default 'MofiGames Team',
  default_language text not null default 'en',
  default_region text not null default 'US',
  default_robots_index boolean not null default true,
  default_robots_follow boolean not null default true,
  canonical_domain text not null default 'non-www',
  trailing_slash text not null default 'remove',

  -- Search engine verification
  google_site_verification text not null default '',
  bing_site_verification text not null default '',
  yandex_site_verification text not null default '',
  baidu_site_verification text not null default '',

  -- Home page SEO
  home_seo_title text not null default '',
  home_meta_description text not null default '',
  home_og_image_url text,

  -- Social media defaults
  default_og_image_url text,
  default_og_image_alt text not null default '',
  twitter_site text not null default '',
  twitter_creator text not null default '',
  twitter_card_type text not null default 'summary_large_image',

  -- Organization schema (used site-wide in the Organization JSON-LD)
  org_name text not null default 'MofiGames',
  org_logo_url text,
  org_same_as text[] not null default '{}',

  -- robots.txt (null = use the auto-generated default; see src/lib/seo.ts)
  robots_txt_override text,

  -- Sitemap enable/disable per type
  sitemap_games_enabled boolean not null default true,
  sitemap_categories_enabled boolean not null default true,
  sitemap_tags_enabled boolean not null default true,
  sitemap_blog_enabled boolean not null default true,
  sitemap_pages_enabled boolean not null default true,
  sitemap_images_enabled boolean not null default true,

  -- Indexing controls (global — a per-item noindex still wins over these)
  index_games boolean not null default true,
  index_categories boolean not null default true,
  index_tags boolean not null default true,
  index_blog boolean not null default true,
  index_pages boolean not null default true,
  index_search_pages boolean not null default false,
  index_author_pages boolean not null default false,

  updated_at timestamptz not null default now(),

  constraint seo_settings_singleton check (id)
);

insert into public.seo_settings (id) values (true) on conflict (id) do nothing;

alter table public.seo_settings enable row level security;

-- Publicly readable (metadata/sitemap/robots generation runs on public
-- pages, unauthenticated) — write is admin-only.
drop policy if exists "SEO settings are publicly readable" on public.seo_settings;
create policy "SEO settings are publicly readable"
  on public.seo_settings for select
  using (true);

drop policy if exists "Admins can manage SEO settings" on public.seo_settings;
create policy "Admins can manage SEO settings"
  on public.seo_settings for all
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists seo_settings_set_updated_at on public.seo_settings;
create trigger seo_settings_set_updated_at
  before update on public.seo_settings
  for each row execute function public.set_updated_at();

alter table public.seo_settings drop constraint if exists seo_settings_canonical_domain_check;
alter table public.seo_settings add constraint seo_settings_canonical_domain_check
  check (canonical_domain in ('www', 'non-www'));

alter table public.seo_settings drop constraint if exists seo_settings_trailing_slash_check;
alter table public.seo_settings add constraint seo_settings_trailing_slash_check
  check (trailing_slash in ('add', 'remove', 'ignore'));

-- ---------------------------------------------------------------------------
-- seo_redirects — Redirect Manager (301/302/307/308/410).
-- ---------------------------------------------------------------------------
create table if not exists public.seo_redirects (
  id uuid primary key default gen_random_uuid(),
  source_path text unique not null,
  destination_path text,
  redirect_type smallint not null default 301,
  is_active boolean not null default true,
  hit_count bigint not null default 0,
  last_hit_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.seo_redirects drop constraint if exists seo_redirects_type_check;
alter table public.seo_redirects add constraint seo_redirects_type_check
  check (redirect_type in (301, 302, 307, 308, 410));

alter table public.seo_redirects drop constraint if exists seo_redirects_destination_check;
alter table public.seo_redirects add constraint seo_redirects_destination_check
  check (redirect_type = 410 or destination_path is not null);

create index if not exists seo_redirects_source_path_idx on public.seo_redirects (source_path);
create index if not exists seo_redirects_is_active_idx on public.seo_redirects (is_active);

alter table public.seo_redirects enable row level security;

-- Publicly readable (the middleware that applies redirects runs on every
-- request, unauthenticated) — write is admin-only.
drop policy if exists "Active redirects are publicly readable" on public.seo_redirects;
create policy "Active redirects are publicly readable"
  on public.seo_redirects for select
  using (true);

drop policy if exists "Admins can manage redirects" on public.seo_redirects;
create policy "Admins can manage redirects"
  on public.seo_redirects for all
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists seo_redirects_set_updated_at on public.seo_redirects;
create trigger seo_redirects_set_updated_at
  before update on public.seo_redirects
  for each row execute function public.set_updated_at();

-- Atomically bumps a redirect's hit counter — called from middleware, kept
-- as a single round trip (increment + timestamp) instead of a read-then-write.
create or replace function public.record_redirect_hit(p_source_path text)
returns void
language sql
security definer set search_path = public
as $$
  update public.seo_redirects
  set hit_count = hit_count + 1, last_hit_at = now()
  where source_path = p_source_path;
$$;
