-- MofiGames — Migration 0076: Mobile Homepage CMS
--
-- Creates a dedicated table for mobile homepage section configuration.
-- Each row maps a category/system key → a visual template → a display position.
--
-- Design decisions:
--  • Reuses the SAME categories table and system keys as the PC homepage.
--  • section_key mirrors the format used in homepage_sections / homepage_section_games
--    ('system:featured', 'system:trending', 'system:new', 'system:editors_pick',
--     'system:sponsored', 'genre:<slug>', 'category:<slug>').
--  • template_id (1-5) selects the visual template. The code side has a
--    type-safe MOBILE_TEMPLATES constant that maps numbers to component names.
--  • game_sort controls which game subset is rendered in that section.
--  • settings JSONB is available for future template-specific knobs without
--    another migration each time.
--  • ContinuePlayingMobile is NEVER stored here — it's always first, hard-wired
--    in MobileHome.tsx and must not be touched.

-- ---------------------------------------------------------------------------
-- mobile_homepage_sections
-- ---------------------------------------------------------------------------
create table if not exists public.mobile_homepage_sections (
  id uuid primary key default gen_random_uuid(),
  -- Stable identifier: 'system:featured' | 'system:trending' | 'system:new' |
  -- 'system:editors_pick' | 'system:sponsored' | 'genre:<slug>' | 'category:<slug>'
  section_key text not null unique,
  -- 1 = Hero Video, 2 = 3×2 Fixed Grid, 3 = Rect Swipe (colored bg),
  -- 4 = Color Category Swipe, 5 = Standard Swipe
  template_id integer not null default 5 check (template_id between 1 and 5),
  -- Global display order (lower = higher on page). Rewritten 10, 20, 30...
  -- by the drag-and-drop admin UI so gaps stay uniform.
  position integer not null default 0,
  -- Custom section title override; null = use category/system default
  title text,
  -- Optional subtitle shown beneath the title (some templates support this)
  subtitle text,
  -- Enabled/disabled toggle — disabled sections are excluded from the page
  is_enabled boolean not null default true,
  -- How many games to load (1-30). Template 1 (hero) typically uses 1.
  game_limit integer not null default 10 check (game_limit between 1 and 30),
  -- Sort order for the game subset displayed in this section
  game_sort text not null default 'popular'
    check (game_sort in ('popular', 'new', 'trending', 'featured', 'editors_pick', 'random')),
  -- Show "View All →" link? Defaults true.
  show_view_all boolean not null default true,
  -- Free-form per-template settings (autoplay, rows, accent color override…)
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.mobile_homepage_sections is
  'CMS configuration for each section on the mobile homepage. Shares category/system keys with the PC homepage_sections table but drives an independent visual layout (template 1-5) and section ordering.';

comment on column public.mobile_homepage_sections.section_key is
  'Stable section identifier matching the homepage_sections key format: system:featured | system:trending | genre:<slug> | category:<slug>. Unique per row.';

comment on column public.mobile_homepage_sections.template_id is
  '1=Hero Video, 2=3×2 Fixed Grid, 3=Rect Swipe colored bg, 4=Color Category Swipe, 5=Standard Swipe';

comment on column public.mobile_homepage_sections.position is
  'Global display order. Lower = higher on the mobile homepage. The admin drag-and-drop rewriter uses 10, 20, 30... gaps.';

alter table public.mobile_homepage_sections enable row level security;

-- Public can read (homepage renders server-side with the public client)
drop policy if exists "Mobile homepage sections are publicly readable" on public.mobile_homepage_sections;
create policy "Mobile homepage sections are publicly readable"
  on public.mobile_homepage_sections for select
  using (true);

-- Only admins can mutate
drop policy if exists "Admins can manage mobile homepage sections" on public.mobile_homepage_sections;
create policy "Admins can manage mobile homepage sections"
  on public.mobile_homepage_sections for all
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists mobile_homepage_sections_set_updated_at on public.mobile_homepage_sections;
create trigger mobile_homepage_sections_set_updated_at
  before update on public.mobile_homepage_sections
  for each row execute function public.set_updated_at();

-- Seed sensible defaults that reproduce the existing MobileHome.tsx layout
-- (minus ContinuePlayingMobile which is always first and never in this table).
-- on conflict do nothing = safe to re-run without stomping admin edits.
insert into public.mobile_homepage_sections
  (section_key, template_id, position, title, game_limit, game_sort, show_view_all)
values
  ('system:featured',      1, 10,  'Featured',          1,  'featured',     true),
  ('system:sponsored',     4, 20,  'Sponsored',         10, 'popular',      false),
  ('system:originals',     3, 30,  'MofiGames Originals', 10, 'popular',   true),
  ('genre:sports',         5, 40,  'Sports',            10, 'popular',      true),
  ('system:trending',      4, 50,  'Can''t Stop Playing', 10, 'trending',   true),
  ('genre:multiplayer',    5, 60,  'Play with Friends', 10, 'popular',      true),
  ('genre:brain',          3, 70,  'Brain Games',       10, 'popular',      true),
  ('system:editors_pick',  5, 80,  'Editor''s Picks',   10, 'editors_pick', true),
  ('genre:sports',         5, 90,  'Sports Games',      10, 'popular',      true),
  ('genre:driving',        4, 100, 'Driving Games',     10, 'popular',      true),
  ('system:new',           2, 110, 'New Games',         6,  'new',          true),
  ('genre:action',         5, 120, 'Action',            10, 'popular',      true),
  ('genre:adventure',      5, 130, 'Adventure',         10, 'popular',      true),
  ('genre:arcade',         3, 140, 'Arcade',            10, 'popular',      true),
  ('genre:io-games',       5, 150, '.io Games',         10, 'popular',      true),
  ('genre:shooting-games', 4, 160, 'Shooting Games',    10, 'popular',      true),
  ('genre:puzzle-games',   5, 170, 'Puzzle Games',      10, 'popular',      true),
  ('genre:simulation',     3, 180, 'Simulation',        10, 'popular',      true),
  ('genre:strategy',       5, 190, 'Strategy',          10, 'popular',      true)
on conflict (section_key) do nothing;

-- Covering index for the mobile homepage server read
create index if not exists mobile_homepage_sections_position_enabled_idx
  on public.mobile_homepage_sections (position, is_enabled)
  where is_enabled = true;
