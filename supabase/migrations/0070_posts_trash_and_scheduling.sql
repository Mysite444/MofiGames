-- MofiGames — Posts CMS upgrade: Trash / Restore / Permanent Delete,
-- Scheduling, and published_at tracking.
-- Run in Supabase SQL Editor. Safe to run multiple times (all `if not exists`).
--
-- Mirrors the same pattern used by migration 0069 (games_trash_and_duplication)
-- so posts and games behave consistently throughout the admin.

-- ---------------------------------------------------------------------------
-- posts — soft-delete columns (Trash workflow)
-- ---------------------------------------------------------------------------
alter table public.posts add column if not exists deleted_at timestamptz;
alter table public.posts add column if not exists deleted_by uuid references auth.users (id) on delete set null;

-- ---------------------------------------------------------------------------
-- posts — scheduling column.
-- When is_published=false AND scheduled_publish_at IS NOT NULL AND the
-- value is in the future, the post is treated as "Scheduled". The
-- automation cron (src/lib/automation/executors.ts scheduledPublishing)
-- flips is_published=true and clears scheduled_publish_at when the time
-- arrives — same executor as for games, extended to cover posts.
-- ---------------------------------------------------------------------------
alter table public.posts add column if not exists scheduled_publish_at timestamptz;

-- ---------------------------------------------------------------------------
-- indexes
-- ---------------------------------------------------------------------------

-- Trash view: only trashed posts need to be found fast.
create index if not exists posts_trash_idx
  on public.posts (deleted_at desc)
  where deleted_at is not null;

-- Admin list default: not-trashed, newest-first (mirrors games_admin_list_idx).
create index if not exists posts_admin_list_idx
  on public.posts (deleted_at, created_at desc);

-- Scheduled publishing cron lookup.
create index if not exists posts_scheduled_idx
  on public.posts (scheduled_publish_at)
  where is_published = false and scheduled_publish_at is not null;

-- ---------------------------------------------------------------------------
-- RLS — trashed and scheduled posts must never be publicly visible.
-- Replaces the original "Published posts are publicly readable" policy
-- (migration 0007) so trashed posts can't stay live regardless of
-- is_published value, and scheduled posts don't go live early.
-- ---------------------------------------------------------------------------
drop policy if exists "Published posts are publicly readable" on public.posts;
create policy "Published posts are publicly readable"
  on public.posts for select
  using (
    public.is_admin()
    or (
      is_published = true
      and deleted_at is null
      and (scheduled_publish_at is null or scheduled_publish_at <= now())
    )
  );

-- Rollback:
--   drop policy if exists "Published posts are publicly readable" on public.posts;
--   create policy "Published posts are publicly readable"
--     on public.posts for select
--     using (is_published = true or public.is_admin());
--   drop index if exists public.posts_scheduled_idx;
--   drop index if exists public.posts_admin_list_idx;
--   drop index if exists public.posts_trash_idx;
--   alter table public.posts drop column if exists scheduled_publish_at;
--   alter table public.posts drop column if exists deleted_by;
--   alter table public.posts drop column if exists deleted_at;
