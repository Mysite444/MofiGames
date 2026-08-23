-- MofiGames — Phase 8: full Game Management field set.
-- Adds every field from the Game Management spec that isn't already a
-- column (instructions, controls, cover image, trailer/preview video,
-- developer/publisher/release/version, mobile/fullscreen/orientation,
-- width/height, loading screen + estimated loading time, visibility,
-- SEO, trending/recommended flags), plus tag assignment for games and
-- two auto-maintained aggregates (favorite_count, average rating) that
-- were previously either missing or admin-typed by hand.
-- Run in Supabase SQL Editor. Safe to run multiple times.

-- ---------------------------------------------------------------------------
-- games — new columns. All nullable or defaulted so this is a no-op for
-- existing rows; the admin form's `emptyForm` fills sane defaults for new
-- games.
-- ---------------------------------------------------------------------------
alter table public.games add column if not exists instructions text not null default '';
alter table public.games add column if not exists controls text not null default '';

alter table public.games add column if not exists cover_image_url text;
alter table public.games add column if not exists video_trailer_url text;
-- Short, silent, looping clip used for hover-preview (desktop GameCard)
-- and the autoplay background loop behind the hero on the mobile game
-- page — deliberately separate from video_trailer_url (a longer, often
-- narrated/scored trailer meant for deliberate viewing, not autoplay).
alter table public.games add column if not exists preview_video_url text;

alter table public.games add column if not exists developer text not null default '';
alter table public.games add column if not exists publisher text not null default '';
alter table public.games add column if not exists release_date date;
alter table public.games add column if not exists version text not null default '';

alter table public.games add column if not exists mobile_support boolean not null default true;
alter table public.games add column if not exists fullscreen_enabled boolean not null default true;
alter table public.games add column if not exists width integer;
alter table public.games add column if not exists height integer;

alter table public.games add column if not exists orientation text not null default 'landscape';
alter table public.games drop constraint if exists games_orientation_check;
alter table public.games add constraint games_orientation_check
  check (orientation in ('landscape', 'portrait'));

alter table public.games add column if not exists loading_screen_url text;
alter table public.games add column if not exists estimated_loading_seconds integer;

alter table public.games add column if not exists visibility text not null default 'public';
alter table public.games drop constraint if exists games_visibility_check;
alter table public.games add constraint games_visibility_check
  check (visibility in ('public', 'private', 'unlisted'));

-- Curated homepage flags: is_featured/is_editors_pick/is_sponsored already
-- exist (migration 0006). Trending and Recommended are separate manual
-- overrides an admin can set explicitly, on top of the site's own
-- plays-based "Trending" ranking (src/lib/curated-games.ts) which stays
-- fully automatic and needs no column.
alter table public.games add column if not exists is_trending boolean not null default false;
alter table public.games add column if not exists is_recommended boolean not null default false;

-- SEO
alter table public.games add column if not exists meta_title text not null default '';
alter table public.games add column if not exists meta_description text not null default '';

-- Average Rating / Favorite Count — automatically maintained (see
-- triggers below). `rating` itself already existed as an admin-set
-- number; it's repurposed here to mean "the maintained average" once at
-- least one real rating exists, but keeps its admin-set value as a
-- reasonable seed/fallback before that (new games have no ratings yet).
alter table public.games add column if not exists rating_count integer not null default 0;
alter table public.games add column if not exists favorite_count integer not null default 0;

create index if not exists games_visibility_idx on public.games (visibility);
create index if not exists games_is_trending_idx on public.games (is_trending);
create index if not exists games_is_recommended_idx on public.games (is_recommended);

-- No new RLS policies needed for these columns — all covered by the
-- existing "publicly readable if published" / "admins can manage"
-- policies on `games` from migration 0003.

-- ---------------------------------------------------------------------------
-- game_tags — many-to-many between games and the existing `tags` table
-- (migration 0007, previously blog/news-only — reused here rather than
-- creating a parallel tags table).
-- ---------------------------------------------------------------------------
create table if not exists public.game_tags (
  game_id uuid not null references public.games (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (game_id, tag_id)
);

alter table public.game_tags enable row level security;

drop policy if exists "Game tags are publicly readable" on public.game_tags;
create policy "Game tags are publicly readable"
  on public.game_tags for select
  using (true);

drop policy if exists "Admins can manage game tags" on public.game_tags;
create policy "Admins can manage game tags"
  on public.game_tags for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- game_ratings — one row per (user, game), 1-5 stars. `games.rating` /
-- `games.rating_count` are kept in sync via the trigger below rather than
-- computed on every read.
-- ---------------------------------------------------------------------------
create table if not exists public.game_ratings (
  user_id uuid not null references auth.users (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

alter table public.game_ratings enable row level security;

drop policy if exists "Users can view their own rating" on public.game_ratings;
create policy "Users can view their own rating"
  on public.game_ratings for select
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "Users can rate a game" on public.game_ratings;
create policy "Users can rate a game"
  on public.game_ratings for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can change their own rating" on public.game_ratings;
create policy "Users can change their own rating"
  on public.game_ratings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can remove their own rating" on public.game_ratings;
create policy "Users can remove their own rating"
  on public.game_ratings for delete
  using (auth.uid() = user_id);

drop trigger if exists game_ratings_set_updated_at on public.game_ratings;
create trigger game_ratings_set_updated_at
  before update on public.game_ratings
  for each row execute function public.set_updated_at();

-- Recomputes games.rating (avg, rounded to 1 decimal) and
-- games.rating_count for one game. If a game has no ratings yet, its
-- rating/rating_count are left untouched (so an admin-seeded starter
-- rating doesn't get clobbered back to 0 the instant this migration
-- runs) — count only ever reaches 0 here if the last rating was deleted,
-- in which case rating_count correctly drops to 0 but rating itself is
-- left as-is rather than reset.
create or replace function public.recompute_game_rating(p_game_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_avg numeric(2,1);
  v_count integer;
begin
  select round(avg(rating)::numeric, 1), count(*) into v_avg, v_count
  from public.game_ratings
  where game_id = p_game_id;

  if v_count > 0 then
    update public.games set rating = v_avg, rating_count = v_count where id = p_game_id;
  else
    update public.games set rating_count = 0 where id = p_game_id;
  end if;
end;
$$;

create or replace function public.game_ratings_after_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.recompute_game_rating(coalesce(new.game_id, old.game_id));
  return null;
end;
$$;

drop trigger if exists game_ratings_sync_games on public.game_ratings;
create trigger game_ratings_sync_games
  after insert or update or delete on public.game_ratings
  for each row execute function public.game_ratings_after_change();

-- ---------------------------------------------------------------------------
-- Favorite Count — automatically maintained from the existing
-- `favorites` table (migration 0002), which is keyed by slug rather than
-- game id.
-- ---------------------------------------------------------------------------
create or replace function public.recompute_favorite_count(p_slug text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.games
  set favorite_count = (select count(*) from public.favorites where slug = p_slug)
  where slug = p_slug;
end;
$$;

create or replace function public.favorites_after_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.recompute_favorite_count(coalesce(new.slug, old.slug));
  return null;
end;
$$;

drop trigger if exists favorites_sync_games on public.favorites;
create trigger favorites_sync_games
  after insert or delete on public.favorites
  for each row execute function public.favorites_after_change();

-- Backfill favorite_count for any favorites that already exist.
update public.games g
set favorite_count = (select count(*) from public.favorites f where f.slug = g.slug);

-- ---------------------------------------------------------------------------
-- Storage: cover images, trailer/preview video, loading screen images.
-- One bucket for all game media — public-read, admin-write, same pattern
-- as game-thumbnails/game-files/content-images.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('game-media', 'game-media', true)
on conflict (id) do nothing;

drop policy if exists "Public read game-media" on storage.objects;
create policy "Public read game-media"
  on storage.objects for select
  using (bucket_id = 'game-media');

drop policy if exists "Admins can write game-media" on storage.objects;
create policy "Admins can write game-media"
  on storage.objects for insert
  with check (bucket_id = 'game-media' and public.is_admin());

drop policy if exists "Admins can update game-media" on storage.objects;
create policy "Admins can update game-media"
  on storage.objects for update
  using (bucket_id = 'game-media' and public.is_admin());

drop policy if exists "Admins can delete game-media" on storage.objects;
create policy "Admins can delete game-media"
  on storage.objects for delete
  using (bucket_id = 'game-media' and public.is_admin());
