-- MofiGames — Game Management CMS upgrade: Trash / Restore / Permanent
-- Delete, and duplicate-game provenance.
-- Run in Supabase SQL Editor. Safe to run multiple times.
--
-- Why a soft-delete column instead of deleting the row immediately:
-- previously DELETE /api/admin/games/:id was an irreversible hard delete —
-- one click, no recovery, and no way to review what was removed. This adds
-- a proper two-step trash workflow (Move to Trash → Restore, or → Delete
-- permanently) matching every other professional CMS, without touching how
-- `games` is read anywhere that already filters on is_published/visibility
-- explicitly (those call sites are additionally protected below via RLS,
-- not just by omission).

-- ---------------------------------------------------------------------------
-- games — trash columns. Both nullable/defaulted so this is a no-op for
-- existing rows (nothing is trashed by default).
-- ---------------------------------------------------------------------------
alter table public.games add column if not exists deleted_at timestamptz;
alter table public.games add column if not exists deleted_by uuid references auth.users (id) on delete set null;

-- Provenance for "Duplicate game" (Phase 12) — nullable, purely
-- informational (shown in the admin UI as "Duplicated from X"), never
-- required. `on delete set null` so deleting the original later doesn't
-- block deleting/keeping its duplicate.
alter table public.games add column if not exists duplicated_from uuid references public.games (id) on delete set null;

-- Partial index: only rows actually in the trash need to be found fast (the
-- Trash view lists them by deleted_at desc); every other index on `games`
-- already assumes deleted_at is null for the "live" table, so indexing only
-- the trashed slice keeps this small regardless of how large `games` grows.
create index if not exists games_trash_idx on public.games (deleted_at desc) where deleted_at is not null;

-- Admin games list default view (Phase 1/2/15) is "not trashed, newest
-- first" before any search/filter is applied — same shape as the existing
-- games_homepage_feed_idx (0064) for the public feed, mirrored here for the
-- admin list so it also gets a single index scan instead of a sequential
-- scan + sort once the table has more than a handful of rows.
create index if not exists games_admin_list_idx on public.games (deleted_at, created_at desc);

-- ---------------------------------------------------------------------------
-- games.published_at — the "Published date" the CMS spec calls for
-- (Phase 1 column, Phase 2 sort). Nothing previously recorded *when* a
-- game first went live — only the is_published boolean. Set once, the
-- first time a game is published, and never overwritten by a later
-- unpublish/republish (matches created_at/updated_at semantics: "when
-- this first happened", not "current state"). Implemented as a trigger
-- so it's correct no matter which code path flips is_published — a single
-- edit, a bulk publish action, or the scheduled-publishing cron
-- (src/lib/automation/executors.ts).
-- ---------------------------------------------------------------------------
alter table public.games add column if not exists published_at timestamptz;

-- Backfill: any game that's already published today has obviously been
-- published before this migration ran — best available timestamp is its
-- created_at (better than leaving a published game's date blank).
update public.games set published_at = created_at where is_published = true and published_at is null;

create or replace function public.games_set_published_at()
returns trigger
language plpgsql
as $$
begin
  if new.is_published = true and old.is_published = false and new.published_at is null then
    new.published_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists games_set_published_at on public.games;
create trigger games_set_published_at
  before update on public.games
  for each row execute function public.games_set_published_at();

-- Also cover INSERT (a game can be created already-published, e.g. Publish
-- immediately rather than Save Draft — the UPDATE trigger above never
-- fires for that row's first row since there's no prior UPDATE).
create or replace function public.games_set_published_at_on_insert()
returns trigger
language plpgsql
as $$
begin
  if new.is_published = true and new.published_at is null then
    new.published_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists games_set_published_at_on_insert on public.games;
create trigger games_set_published_at_on_insert
  before insert on public.games
  for each row execute function public.games_set_published_at_on_insert();

create index if not exists games_published_at_idx on public.games (published_at desc);

-- ---------------------------------------------------------------------------
-- RLS — a trashed game must never be publicly visible again, regardless of
-- is_published/visibility (an admin could otherwise trash a game, have it
-- keep showing on the live site from a cache, and wrongly assume it's
-- gone). Admins still see trashed rows (that's what the Trash view lists).
-- This replaces the single "Published games are publicly readable" policy
-- from migration 0003 — same name, updated definition.
-- ---------------------------------------------------------------------------
drop policy if exists "Published games are publicly readable" on public.games;
create policy "Published games are publicly readable"
  on public.games for select
  using (public.is_admin() or (is_published = true and deleted_at is null));

-- Rollback:
--   drop policy if exists "Published games are publicly readable" on public.games;
--   create policy "Published games are publicly readable"
--     on public.games for select
--     using (is_published = true or public.is_admin());
--   drop index if exists public.games_published_at_idx;
--   drop trigger if exists games_set_published_at_on_insert on public.games;
--   drop function if exists public.games_set_published_at_on_insert();
--   drop trigger if exists games_set_published_at on public.games;
--   drop function if exists public.games_set_published_at();
--   alter table public.games drop column if exists published_at;
--   drop index if exists public.games_admin_list_idx;
--   drop index if exists public.games_trash_idx;
--   alter table public.games drop column if exists duplicated_from;
--   alter table public.games drop column if exists deleted_by;
--   alter table public.games drop column if exists deleted_at;
