-- Mofigames — Migration 0046: Metadata Cache (Admin → Cache → Metadata Cache).
--
-- Six pillars, one settings row, plus two real backing facet tables:
--   1. Categories      — single-category lookups (slug, name, colors,
--      description, SEO fields, optional live game count). The *list* of
--      all categories is already fragment-cached (see getAllRealCategories
--      in games-server.ts, "game-cards" fragment) — this pillar is
--      deliberately scoped to individual-record lookups instead, so it
--      never wraps the same query fragment-cache already owns.
--   2. Tags            — single-tag lookups (slug, name, color, SEO
--      fields, optional usage counts across game_tags + post_tags). Wired
--      for real into getTagBySlug() (src/lib/content-server.ts) — that
--      function ran a live query on every /tag/[slug] request before this.
--   3. Developers       — games.developer is a free-text column, not a
--      normalized table, so there's no natural "list of developers"
--      anywhere in the schema. metadata_developer_facets below is the
--      real, computed leaderboard (distinct developer, game count, avg
--      rating), refreshed by POST /api/admin/cache/metadata/recompute-facets,
--      same shape as search_popular_queries (0044_search_cache.sql).
--   4. Publishers       — identical treatment for games.publisher via
--      metadata_publisher_facets.
--   5. Game Metadata    — the full per-game record (instructions,
--      controls, developer/publisher, ratings, every SEO/OG/Twitter
--      field) keyed by slug. Wired for real into getRealGameBySlug()
--      (src/lib/games-server.ts), which is called once by
--      generateMetadata() and again by the page component on every
--      /game/[slug] request — previously two live round trips per
--      request, now at most one per TTL window.
--   6. SEO Metadata     — the *resolved* SEO payload (title, description,
--      canonical, OG/Twitter, robots directives) that buildGameMetadata()
--      (src/lib/seo.ts) computes by merging a game/category/tag's own
--      overrides with the global seo_settings row. Exercised for real by
--      POST .../preview against buildGameMetadata() itself — not yet
--      wired into generateMetadata() in the page files, same "config +
--      real pipeline, not yet a live call site" honesty as Search Cache's
--      Filter Results pillar (see 0044_search_cache.sql).
--
-- Run in Supabase SQL Editor. Safe to run multiple times.

-- ── Settings row ─────────────────────────────────────────────────────────

create table if not exists public.metadata_cache_settings (
  id boolean primary key default true,
  constraint metadata_cache_settings_single_row check (id),

  -- ── 1. Categories Cache ──────────────────────────────────────────────────

  categories_enabled             boolean not null default true,
  categories_ttl_seconds         int     not null default 3600
    check (categories_ttl_seconds between 60 and 604800),
  categories_include_seo_fields  boolean not null default true,
  -- Adds a live `count(*) from games where category_slug = ...` to each
  -- cached record — cheap on this app's data volume, but still an extra
  -- query per miss, hence its own toggle rather than always-on.
  categories_include_game_counts boolean not null default true,
  categories_max_entries         int     not null default 300
    check (categories_max_entries between 10 and 5000),

  -- ── 2. Tags Cache ─────────────────────────────────────────────────────────

  tags_enabled              boolean not null default true,
  tags_ttl_seconds          int     not null default 1800
    check (tags_ttl_seconds between 60 and 604800),
  tags_include_seo_fields   boolean not null default true,
  -- Adds a game_tags + post_tags count to each cached record — same
  -- cost/toggle reasoning as categories_include_game_counts.
  tags_include_usage_counts boolean not null default true,
  tags_max_entries          int     not null default 500
    check (tags_max_entries between 10 and 5000),

  -- ── 3. Developers Cache ───────────────────────────────────────────────────

  developers_enabled             boolean not null default true,
  developers_ttl_seconds         int     not null default 1800
    check (developers_ttl_seconds between 60 and 604800),
  -- A developer credited on only one game is noise for a "Browse by
  -- Developer" style list — same reasoning as search's
  -- popular_searches_min_occurrences.
  developers_min_games           int     not null default 1
    check (developers_min_games between 1 and 1000),
  developers_max_results         int     not null default 100
    check (developers_max_results between 1 and 1000),
  developers_sort_by             text    not null default 'game_count'
    check (developers_sort_by in ('game_count', 'name')),
  developers_last_refreshed_at   timestamptz,
  developers_last_refresh_count  int     not null default 0,

  -- ── 4. Publishers Cache ───────────────────────────────────────────────────

  publishers_enabled             boolean not null default true,
  publishers_ttl_seconds         int     not null default 1800
    check (publishers_ttl_seconds between 60 and 604800),
  publishers_min_games           int     not null default 1
    check (publishers_min_games between 1 and 1000),
  publishers_max_results         int     not null default 100
    check (publishers_max_results between 1 and 1000),
  publishers_sort_by             text    not null default 'game_count'
    check (publishers_sort_by in ('game_count', 'name')),
  publishers_last_refreshed_at   timestamptz,
  publishers_last_refresh_count  int     not null default 0,

  -- ── 5. Game Metadata Cache ────────────────────────────────────────────────

  game_metadata_enabled                boolean not null default true,
  game_metadata_ttl_seconds            int     not null default 300
    check (game_metadata_ttl_seconds between 30 and 86400),
  -- LRU cap on distinct game slugs held at once — mirrors
  -- fragment_cache_settings.max_entries / search's filter_cache_max_combinations.
  game_metadata_max_entries            int     not null default 1000
    check (game_metadata_max_entries between 50 and 20000),
  -- Whether the cached payload's rating_count / favorite_count reflect a
  -- point-in-time snapshot (fine for most reads) or are always excluded
  -- so callers that need live counters skip the cache for those fields.
  game_metadata_include_related_counts boolean not null default true,
  -- An admin previewing a draft/private game must always see live data,
  -- never a cached snapshot from before their edit — mirrors
  -- fragment_cache_settings.bypass_for_admins, and is actually honored by
  -- getRealGameBySlug() in games-server.ts, not just documented here.
  game_metadata_bypass_for_admins      boolean not null default true,

  -- ── 6. SEO Metadata Cache ─────────────────────────────────────────────────

  seo_metadata_enabled         boolean  not null default true,
  seo_metadata_ttl_seconds     int      not null default 900
    check (seo_metadata_ttl_seconds between 60 and 86400),
  seo_metadata_max_entries     int      not null default 1000
    check (seo_metadata_max_entries between 50 and 20000),
  -- Which entity types participate — validated at the application layer
  -- (zod), same shape as search's filter_cacheable_params. "pages" is
  -- listed as a future option; buildPageMetadata()-equivalent doesn't
  -- exist yet so it has no effect until it does.
  seo_metadata_entity_types    text[]   not null default '{games,categories,tags}',
  seo_metadata_include_json_ld boolean  not null default true,

  -- ── Shared diagnostics ────────────────────────────────────────────────────
  -- Live hit/miss/entry counters for all six in-process namespaces live in
  -- process memory (metadata-cache.ts), not here — same reasoning as
  -- fragment_cache_settings / search_cache_settings. Only the last purge
  -- is persisted.
  last_purged_at     timestamptz,
  last_purge_summary jsonb,

  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.metadata_cache_settings (id) values (true) on conflict (id) do nothing;

alter table public.metadata_cache_settings enable row level security;

drop policy if exists "Admins can view metadata cache settings" on public.metadata_cache_settings;
create policy "Admins can view metadata cache settings"
  on public.metadata_cache_settings for select
  using (public.is_admin());

drop policy if exists "Admins can update metadata cache settings" on public.metadata_cache_settings;
create policy "Admins can update metadata cache settings"
  on public.metadata_cache_settings for update
  using (public.is_admin())
  with check (public.is_admin());

-- ── metadata_developer_facets: the real Developers Cache leaderboard ───────
--
-- One row per distinct games.developer value, wholesale-replaced on every
-- recompute (see POST /api/admin/cache/metadata/recompute-facets) — same
-- delete-then-insert reasoning as search_popular_queries. Admin-only: no
-- "Browse by Developer" public page exists yet, so this stays an internal
-- cache-tool artifact until one does.

create table if not exists public.metadata_developer_facets (
  developer   text primary key,
  game_count  int  not null default 0,
  avg_rating  numeric(3, 2),
  computed_at timestamptz not null default now()
);

alter table public.metadata_developer_facets enable row level security;

drop policy if exists "Admins can read developer facets" on public.metadata_developer_facets;
create policy "Admins can read developer facets"
  on public.metadata_developer_facets for select
  using (public.is_admin());

drop policy if exists "Admins can manage developer facets" on public.metadata_developer_facets;
create policy "Admins can manage developer facets"
  on public.metadata_developer_facets for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── metadata_publisher_facets: identical treatment for games.publisher ─────

create table if not exists public.metadata_publisher_facets (
  publisher   text primary key,
  game_count  int  not null default 0,
  avg_rating  numeric(3, 2),
  computed_at timestamptz not null default now()
);

alter table public.metadata_publisher_facets enable row level security;

drop policy if exists "Admins can read publisher facets" on public.metadata_publisher_facets;
create policy "Admins can read publisher facets"
  on public.metadata_publisher_facets for select
  using (public.is_admin());

drop policy if exists "Admins can manage publisher facets" on public.metadata_publisher_facets;
create policy "Admins can manage publisher facets"
  on public.metadata_publisher_facets for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── recompute_developer_facets / recompute_publisher_facets ────────────────
--
-- Called by POST /api/admin/cache/metadata/recompute-facets (admin-only
-- route — these functions themselves grant execute to `authenticated`
-- only, same trust boundary as recompute_popular_searches). security
-- definer so the wholesale delete+insert succeeds regardless of the
-- facet table's own RLS.
--
-- Sort order is fixed here (game_count desc, name asc) — the admin's
-- `developers_sort_by` / `publishers_sort_by` setting re-sorts the
-- already-computed rows client-side instead of round-tripping a second
-- query shape, same "keep SQL simple, format in the app layer" approach
-- as everywhere else in this codebase.

create or replace function public.recompute_developer_facets(
  p_min_games int,
  p_max_results int
)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_count int;
begin
  delete from public.metadata_developer_facets;

  insert into public.metadata_developer_facets (developer, game_count, avg_rating, computed_at)
  select
    developer,
    count(*) as game_count,
    round(avg(rating)::numeric, 2) as avg_rating,
    now()
  from public.games
  where is_published = true
    and btrim(developer) <> ''
  group by developer
  having count(*) >= p_min_games
  order by count(*) desc, developer asc
  limit p_max_results;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.recompute_developer_facets(int, int) to authenticated;

create or replace function public.recompute_publisher_facets(
  p_min_games int,
  p_max_results int
)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_count int;
begin
  delete from public.metadata_publisher_facets;

  insert into public.metadata_publisher_facets (publisher, game_count, avg_rating, computed_at)
  select
    publisher,
    count(*) as game_count,
    round(avg(rating)::numeric, 2) as avg_rating,
    now()
  from public.games
  where is_published = true
    and btrim(publisher) <> ''
  group by publisher
  having count(*) >= p_min_games
  order by count(*) desc, publisher asc
  limit p_max_results;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.recompute_publisher_facets(int, int) to authenticated;
