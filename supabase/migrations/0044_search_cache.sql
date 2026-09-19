-- Mofigames — Migration 0044: Search Cache (Admin → Cache → Search Cache).
--
-- Five features, one settings row, plus one real backing cache table:
--   1. Search Suggestions — "did you mean" style suggestions served from
--      either recent search_queries (0011_analytics.sql), game titles, or
--      both, cached in-process per query (see src/lib/search-cache.ts).
--   2. Popular Searches   — the actual leaderboard of what people search
--      for. search_queries already logs every search (see SearchBox.tsx
--      → POST /api/analytics/search); search_popular_queries below is the
--      *cache* — a precomputed snapshot an admin (or, later, a "Trending
--      searches" widget) can read instantly instead of aggregating the
--      raw log on every request. Refreshed by
--      POST /api/admin/cache/search/recompute-popular, never written to
--      directly by visitors.
--   3. Filter Results     — caching for filtered/faceted game listings
--      (/games?categories=…&tags=…&sort=…). This app's own filtering is
--      still client-side (see GamesBrowseClient.tsx), so there's no live
--      filtered-response cache to size yet — these fields configure the
--      cache-key shape (which params matter, whether device type varies
--      the key) for when/if that listing moves server-side, same
--      forward-compatible spirit as fragment_cache_settings.vary_by_locale.
--   4. Autocomplete       — the type-ahead dropdown itself (distinct from
--      Search Suggestions: autocomplete matches partial game titles as you
--      type, suggestions can also surface what *other people* searched).
--   5. Search Indexes     — which backend answers a search (naive ILIKE,
--      Postgres full-text search, or an external engine like Meilisearch/
--      Algolia) and which content types are indexed. index_last_built_*
--      is populated by POST /api/admin/cache/search/rebuild-index, which
--      for the two Postgres-backed options runs a real query against
--      public.games rather than faking a number.
--
-- Run in Supabase SQL Editor. Safe to run multiple times.

-- ── Settings row ─────────────────────────────────────────────────────────

create table if not exists public.search_cache_settings (
  id boolean primary key default true,
  constraint search_cache_settings_single_row check (id),

  -- ── 1. Search Suggestions ────────────────────────────────────────────────

  suggestions_enabled           boolean not null default true,
  suggestions_source            text    not null default 'both'
    check (suggestions_source in ('search_history', 'game_titles', 'both')),
  suggestions_max_results       int     not null default 6
    check (suggestions_max_results between 1 and 20),
  suggestions_min_chars         int     not null default 2
    check (suggestions_min_chars between 1 and 10),
  suggestions_cache_ttl_seconds int     not null default 300
    check (suggestions_cache_ttl_seconds between 5 and 86400),
  -- True edit-distance fuzzy matching needs the pg_trgm extension; until
  -- that's enabled this approximates "fuzzy" as substring (not just
  -- prefix) matching — see matchQuery() in search-cache.ts.
  suggestions_fuzzy_matching    boolean not null default false,

  -- ── 2. Popular Searches ───────────────────────────────────────────────────

  popular_searches_enabled                  boolean not null default true,
  popular_searches_window_days              int     not null default 7
    check (popular_searches_window_days between 1 and 90),
  popular_searches_max_results              int     not null default 10
    check (popular_searches_max_results between 1 and 50),
  -- A query searched only once or twice in the window is noise, not a
  -- trend — this is the floor before it's allowed on the leaderboard.
  popular_searches_min_occurrences          int     not null default 3
    check (popular_searches_min_occurrences between 1 and 1000),
  popular_searches_refresh_interval_minutes int     not null default 60
    check (popular_searches_refresh_interval_minutes between 5 and 1440),
  -- Excludes queries that consistently return nothing — those belong on
  -- a "searches with no results" content-gap report, not a popularity one.
  popular_searches_exclude_no_results       boolean not null default true,
  popular_searches_last_refreshed_at        timestamptz,
  popular_searches_last_refresh_count       int     not null default 0,

  -- ── 3. Filter Results ─────────────────────────────────────────────────────

  filter_cache_enabled           boolean not null default true,
  filter_cache_ttl_seconds       int     not null default 120
    check (filter_cache_ttl_seconds between 5 and 86400),
  -- Query params that participate in the cache key — anything on
  -- /games not listed here is stripped before hashing, same idea as
  -- cdn_cache_settings.cache_by_query_string_params.
  filter_cacheable_params        text[]  not null default '{q,categories,tags,platforms,modes,sort}',
  -- Upper bound on distinct filter-combination cache entries before the
  -- oldest is evicted — mirrors fragment_cache_settings.max_entries.
  filter_cache_max_combinations  int     not null default 500
    check (filter_cache_max_combinations between 20 and 20000),
  filter_cache_vary_by_device    boolean not null default false,

  -- ── 4. Autocomplete ───────────────────────────────────────────────────────

  autocomplete_enabled          boolean not null default true,
  autocomplete_min_chars        int     not null default 1
    check (autocomplete_min_chars between 1 and 10),
  autocomplete_debounce_ms      int     not null default 150
    check (autocomplete_debounce_ms between 0 and 2000),
  autocomplete_max_suggestions  int     not null default 8
    check (autocomplete_max_suggestions between 1 and 20),
  autocomplete_highlight_match  boolean not null default true,
  autocomplete_match_mode       text    not null default 'prefix'
    check (autocomplete_match_mode in ('prefix', 'contains', 'fuzzy')),

  -- ── 5. Search Indexes ─────────────────────────────────────────────────────

  index_backend       text not null default 'postgres_ilike'
    check (index_backend in ('postgres_ilike', 'postgres_fts', 'external')),
  -- Per-content-type catalogue. Each element:
  --   { "key": string, "label": string, "enabled": boolean, "weight": number }
  -- `key` is the stable identifier rebuild-index/route.ts keys its
  -- per-source doc counts on.
  index_sources jsonb not null default '[
    {"key": "games",       "label": "Games",       "enabled": true,  "weight": 10},
    {"key": "categories",  "label": "Categories",   "enabled": true,  "weight": 6},
    {"key": "tags",        "label": "Tags",         "enabled": true,  "weight": 4},
    {"key": "blog_posts",  "label": "Blog Posts",   "enabled": false, "weight": 3}
  ]'::jsonb,
  index_auto_rebuild            boolean not null default true,
  index_rebuild_interval_hours  int     not null default 24
    check (index_rebuild_interval_hours between 1 and 168),
  index_last_built_at           timestamptz,
  index_last_build_duration_ms  int,
  index_last_build_doc_count    int,
  index_last_build_status       text check (index_last_build_status in ('success', 'failed')),
  index_last_build_message      text,
  -- Only meaningful when index_backend = 'external'.
  external_engine     text not null default 'meilisearch'
    check (external_engine in ('meilisearch', 'algolia')),
  external_host       text,
  -- Plaintext, used only for this app's own rebuild/health-check action,
  -- never forwarded anywhere else — same treatment as every other stored
  -- credential in this app (object_cache_settings.redis_password,
  -- cdn_cache_settings.api_token, session_cache_settings.redis_password).
  external_api_key    text,
  external_index_name text not null default 'games',

  -- ── Shared diagnostics ────────────────────────────────────────────────────
  -- Live hit/miss/entry counters for the in-process Suggestions/Autocomplete
  -- cache live in process memory (search-cache.ts), not here — same
  -- reasoning as fragment_cache_settings. Only the last purge is persisted.
  last_purged_at     timestamptz,
  last_purge_summary jsonb,

  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.search_cache_settings (id) values (true) on conflict (id) do nothing;

alter table public.search_cache_settings enable row level security;

-- Admin-only for both read and write — this row can hold a live external
-- search-engine API key, same reasoning as session_cache_settings /
-- object_cache_settings / dns_cache_settings.
drop policy if exists "Admins can view search cache settings" on public.search_cache_settings;
create policy "Admins can view search cache settings"
  on public.search_cache_settings for select
  using (public.is_admin());

drop policy if exists "Admins can update search cache settings" on public.search_cache_settings;
create policy "Admins can update search cache settings"
  on public.search_cache_settings for update
  using (public.is_admin())
  with check (public.is_admin());

-- ── search_popular_queries: the real Popular Searches cache ────────────────
--
-- One row per ranked query, wholesale-replaced on every recompute (see
-- POST /api/admin/cache/search/recompute-popular) — a small table, so a
-- delete-then-insert per refresh is simpler and cheap enough compared to
-- a diffing upsert. Admin-only, same policy shape as search_queries
-- itself (0011_analytics.sql) since this is a derived analytics view,
-- not a public API.

create table if not exists public.search_popular_queries (
  rank               int primary key,
  query              text not null,
  search_count       int not null default 0,
  avg_results_count  numeric(10, 2) not null default 0,
  had_zero_results   boolean not null default false,
  last_searched_at   timestamptz,
  computed_at        timestamptz not null default now()
);

alter table public.search_popular_queries enable row level security;

drop policy if exists "Admins can read popular searches" on public.search_popular_queries;
create policy "Admins can read popular searches"
  on public.search_popular_queries for select
  using (public.is_admin());

drop policy if exists "Admins can manage popular searches" on public.search_popular_queries;
create policy "Admins can manage popular searches"
  on public.search_popular_queries for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── recompute_popular_searches: the real aggregation ────────────────────────
--
-- Called by POST /api/admin/cache/search/recompute-popular (an admin-only
-- route — this function itself grants execute to `authenticated` only,
-- same trust boundary as increment_game_plays trusts its own caller).
-- security definer so the wholesale delete+insert into
-- search_popular_queries succeeds regardless of that table's RLS,
-- exactly like increment_game_plays needs definer rights to update
-- games.plays from an anon/authenticated caller.
--
-- Ranks distinct queries (case/whitespace-normalized) from the last
-- `p_window_days` days by occurrence count, drops any with fewer than
-- `p_min_occurrences` hits (noise, not a trend), optionally drops queries
-- that *always* returned zero results (a content-gap signal, not a
-- popularity one), and keeps the top `p_max_results`. Returns the number
-- of rows written.
create or replace function public.recompute_popular_searches(
  p_window_days int,
  p_max_results int,
  p_min_occurrences int,
  p_exclude_no_results boolean
)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_count int;
begin
  delete from public.search_popular_queries;

  insert into public.search_popular_queries
    (rank, query, search_count, avg_results_count, had_zero_results, last_searched_at, computed_at)
  select
    row_number() over (order by count(*) desc, max(created_at) desc) as rank,
    max(query) as query,
    count(*) as search_count,
    round(avg(results_count)::numeric, 2) as avg_results_count,
    bool_and(results_count = 0) as had_zero_results,
    max(created_at) as last_searched_at,
    now() as computed_at
  from public.search_queries
  where created_at >= now() - (p_window_days || ' days')::interval
  group by lower(btrim(query))
  having count(*) >= p_min_occurrences
    and (p_exclude_no_results = false or bool_and(results_count = 0) = false)
  order by count(*) desc, max(created_at) desc
  limit p_max_results;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.recompute_popular_searches(int, int, int, boolean) to authenticated;
