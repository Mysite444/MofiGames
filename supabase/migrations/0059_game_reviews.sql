-- MofiGames — Game Reviews: a public 1-5 star rating paired with a short
-- write-up, one per (user, game). New feature, built as part of the
-- XSS-hardening pass (comments/usernames/bios/reviews) — so the write
-- path is sanitized from the start (see createReviewSchema in
-- src/lib/validation.ts and src/lib/sanitize-text.ts) rather than bolted
-- on after the fact.
--
-- Deliberately a separate table from `game_ratings` (migration 0008):
-- game_ratings is a quick star-only rating whose SELECT policy is
-- private/self-only ("Users can view their own rating") — changing that
-- to public would be a behavior change to an existing, already-relied-on
-- feature. Reviews are meant to be publicly readable from the start, like
-- comments, so they get their own table and their own public SELECT
-- policy instead.
--
-- Run after 0058. Idempotent — safe to re-run.

create table if not exists public.game_reviews (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Display-name snapshot taken at post/edit time — same reasoning as
  -- comments.author_name (migration 0004): a review should legibly stay
  -- under the name it was posted with, and readers don't need a join
  -- just to render one.
  author_name text not null default 'Player',
  rating smallint not null check (rating between 1 and 5),
  review_text text not null check (char_length(btrim(review_text)) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, game_id)
);

create index if not exists game_reviews_game_id_created_at_idx
  on public.game_reviews (game_id, created_at desc);

alter table public.game_reviews enable row level security;

drop policy if exists "Reviews are publicly readable" on public.game_reviews;
create policy "Reviews are publicly readable"
  on public.game_reviews for select
  using (true);

drop policy if exists "Users can post their own review" on public.game_reviews;
create policy "Users can post their own review"
  on public.game_reviews for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can edit their own review" on public.game_reviews;
create policy "Users can edit their own review"
  on public.game_reviews for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own review" on public.game_reviews;
create policy "Users can delete their own review"
  on public.game_reviews for delete
  using (auth.uid() = user_id);

-- public.set_updated_at() already exists (created in migration 0008 for
-- game_ratings' own trigger) — reused here rather than redefined.
drop trigger if exists game_reviews_set_updated_at on public.game_reviews;
create trigger game_reviews_set_updated_at
  before update on public.game_reviews
  for each row execute function public.set_updated_at();
