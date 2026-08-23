-- MofiGames — Phase 30: Homepage Categories Manager.
--
-- Problem this solves: real (DB-backed) categories already got editable
-- heading / position / show-hide via migration 0029 (categories.homepage_*
-- columns + Admin → Categories → Homepage Placement). But the 18 built-in
-- genre rows (Action, Puzzle Games, Arcade, ...) and the "system" curated
-- rows (Featured Games, Sponsored, New Games, MofiGames Originals, Can't
-- Stop Playing, Editor's Picks, Recently Updated) are hardcoded straight
-- into src/app/page.tsx with no admin control at all.
--
-- `homepage_sections` gives those 25 rows the same three controls real
-- categories already have (label / position / visibility), living in one
-- global position number-space alongside categories.homepage_position so
-- the whole homepage — system rows, genre rows, and real categories —
-- can be reordered against each other from a single admin screen.
--
-- `homepage_section_games` is new for everyone: a manual "pin any
-- published game onto any row" list, additive to whatever games a row
-- already shows automatically (by category_slug, by curated flag, etc).
-- section_key covers all three row kinds so pinning works the same way
-- everywhere: 'system:<name>' | 'genre:<slug>' | 'category:<slug>'.
--
-- Run in Supabase SQL Editor. Safe to run multiple times.

-- ---------------------------------------------------------------------------
-- homepage_sections
-- ---------------------------------------------------------------------------
create table if not exists public.homepage_sections (
  section_key text primary key,
  section_type text not null check (section_type in ('system', 'genre')),
  position integer not null default 0,
  label text,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.homepage_sections is
  'Admin-configurable heading / order / visibility for the 7 system-curated homepage rows and the 18 built-in genre rows. Real DB categories keep using categories.homepage_position / homepage_label / show_on_homepage (migration 0029) — both live in the same global position number-space so every row on the homepage sorts together.';
comment on column public.homepage_sections.section_key is
  'Stable identifier, e.g. system:featured, genre:action. See src/lib/homepage-section-registry.ts.';
comment on column public.homepage_sections.position is
  'Global sort priority shared with categories.homepage_position — lower appears first. Rewritten 0, 10, 20... across every row whenever the admin reorders.';
comment on column public.homepage_sections.label is
  'Custom section heading override. NULL/empty falls back to the row''s default label from the code registry.';

alter table public.homepage_sections enable row level security;

drop policy if exists "Homepage sections are publicly readable" on public.homepage_sections;
create policy "Homepage sections are publicly readable"
  on public.homepage_sections for select
  using (true);

drop policy if exists "Admins can manage homepage sections" on public.homepage_sections;
create policy "Admins can manage homepage sections"
  on public.homepage_sections for all
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists homepage_sections_set_updated_at on public.homepage_sections;
create trigger homepage_sections_set_updated_at
  before update on public.homepage_sections
  for each row execute function public.set_updated_at();

-- Seed the 25 known rows with default positions that exactly reproduce the
-- current hardcoded page order (10-unit gaps to leave room for real
-- categories to be interleaved anywhere via their own homepage_position).
-- `on conflict do nothing` — safe to re-run, and never clobbers an admin's
-- existing edits if this migration is re-applied.
insert into public.homepage_sections (section_key, section_type, position, label) values
  ('system:featured',     'system', 10,  null),
  ('system:sponsored',    'system', 20,  null),
  ('system:new',          'system', 30,  null),
  ('system:originals',    'system', 40,  null),
  ('system:trending',     'system', 50,  null),
  ('genre:multiplayer',   'genre',  60,  'Play with Friends'),
  ('genre:brain',         'genre',  70,  'Brain Games'),
  ('system:editors_pick', 'system', 80,  null),
  ('genre:sports',        'genre',  90,  'Sports Games'),
  ('genre:driving',       'genre',  100, 'Driving Games'),
  ('genre:action',        'genre',  110, null),
  ('genre:adventure',     'genre',  120, null),
  ('genre:arcade',        'genre',  130, null),
  ('genre:io-games',      'genre',  140, null),
  ('genre:shooting-games','genre',  150, null),
  ('genre:puzzle-games',  'genre',  160, null),
  ('genre:simulation',    'genre',  170, null),
  ('genre:strategy',      'genre',  180, null),
  ('genre:trivia',        'genre',  190, null),
  ('genre:word',          'genre',  200, null),
  ('genre:casual',        'genre',  210, null),
  ('genre:board',         'genre',  220, null),
  ('genre:card',          'genre',  230, null),
  ('genre:clicker',       'genre',  240, null),
  ('system:updated',      'system', 250, null)
on conflict (section_key) do nothing;

-- ---------------------------------------------------------------------------
-- homepage_section_games — manual "pin any game to any row" overrides
-- ---------------------------------------------------------------------------
create table if not exists public.homepage_section_games (
  id uuid primary key default gen_random_uuid(),
  section_key text not null,
  game_id uuid not null references public.games (id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (section_key, game_id)
);

comment on table public.homepage_section_games is
  'Manually pinned games per homepage row, additive to that row''s automatic list (deduped by game id). section_key format: system:<name> | genre:<slug> | category:<slug> — the same key space used for real categories lets any category (built-in or admin-added) accept manual pins too.';

create index if not exists homepage_section_games_section_idx
  on public.homepage_section_games (section_key, position);
create index if not exists homepage_section_games_game_idx
  on public.homepage_section_games (game_id);

alter table public.homepage_section_games enable row level security;

drop policy if exists "Homepage section games are publicly readable" on public.homepage_section_games;
create policy "Homepage section games are publicly readable"
  on public.homepage_section_games for select
  using (true);

drop policy if exists "Admins can manage homepage section games" on public.homepage_section_games;
create policy "Admins can manage homepage section games"
  on public.homepage_section_games for all
  using (public.is_admin())
  with check (public.is_admin());
