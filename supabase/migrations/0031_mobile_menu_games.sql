-- Mofigames — Phase 31: Mobile Menu Featured Games.
--
-- Problem this solves: the "Featured Games" row inside the mobile hamburger
-- menu is hardcoded in MobileDrawer.tsx (getFeaturedGames() pulls one game
-- per genre from the static library). Admins have no way to choose which
-- real games appear there.
--
-- `mobile_menu_games` is a simple ordered list of pinned game IDs that the
-- admin can manage from Homepage → Mobile Menu. When this table has rows,
-- MobileDrawer reads them and shows those games instead of the static
-- fallback. When it's empty the drawer falls back to getFeaturedGames()
-- exactly as before, so the feature is fully opt-in with zero visual change
-- until an admin first configures it.
--
-- Run in Supabase SQL Editor. Safe to run multiple times (idempotent).

-- ---------------------------------------------------------------------------
-- mobile_menu_games
-- ---------------------------------------------------------------------------
create table if not exists public.mobile_menu_games (
  id         uuid        primary key default gen_random_uuid(),
  game_id    uuid        not null references public.games (id) on delete cascade,
  position   integer     not null default 0,
  created_at timestamptz not null default now(),
  unique (game_id)
);

comment on table public.mobile_menu_games is
  'Ordered list of games shown in the "Featured Games" row of the mobile hamburger drawer. '
  'When empty the drawer falls back to the static getFeaturedGames() selection. '
  'Recommended 6–12 portrait-thumbnail games for best scroll UX.';
comment on column public.mobile_menu_games.position is
  'Sort order — lower value appears first. Rewritten 0,1,2... on every admin reorder.';

create index if not exists mobile_menu_games_position_idx
  on public.mobile_menu_games (position);

alter table public.mobile_menu_games enable row level security;

-- Public homepage (MobileDrawer) reads this client-side without auth.
drop policy if exists "Mobile menu games are publicly readable" on public.mobile_menu_games;
create policy "Mobile menu games are publicly readable"
  on public.mobile_menu_games for select
  using (true);

-- Only admins may insert / update / delete.
drop policy if exists "Admins can manage mobile menu games" on public.mobile_menu_games;
create policy "Admins can manage mobile menu games"
  on public.mobile_menu_games for all
  using (public.is_admin())
  with check (public.is_admin());
