-- MofiGames — Phase 6: Homepage manager (Editor's Picks, Featured
-- Collection, Sponsored Games). Latest/New/Trending stay fully automatic
-- (already driven by created_at/tag/plays) so they need no new columns.
-- Run in Supabase SQL Editor. Safe to run multiple times.

alter table public.games add column if not exists is_featured boolean not null default false;
alter table public.games add column if not exists featured_order integer;

alter table public.games add column if not exists is_editors_pick boolean not null default false;
alter table public.games add column if not exists editors_pick_order integer;

alter table public.games add column if not exists is_sponsored boolean not null default false;
alter table public.games add column if not exists sponsored_order integer;
alter table public.games add column if not exists sponsor_label text;

create index if not exists games_is_featured_idx on public.games (is_featured);
create index if not exists games_is_editors_pick_idx on public.games (is_editors_pick);
create index if not exists games_is_sponsored_idx on public.games (is_sponsored);

-- No new RLS policies needed — these are just extra columns on `games`,
-- already covered by the existing "publicly readable if published" /
-- "admins can manage" policies from migration 0003.
