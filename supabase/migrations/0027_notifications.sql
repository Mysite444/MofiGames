-- MofiGames — Notifications: a public, site-wide announcement feed (right
-- now just "a new game was added", real upload or embed alike — see POST
-- /api/admin/games), surfaced via the bell icon in the header. Run in
-- Supabase Dashboard → SQL Editor. Safe to run multiple times.
--
-- This is NOT a per-user inbox — every visitor sees the same feed, same as
-- a "what's new" feed on any game portal. "Read" state is tracked
-- client-side (newest-seen timestamp in localStorage, see
-- src/lib/notifications.ts) rather than a per-user table, since these are
-- broadcast announcements rather than personal messages.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'new_game',
  title text not null,
  message text,
  link text,
  thumbnail_url text,
  -- Kept for reference (e.g. future "notifications about game X"
  -- filtering); set null rather than cascading on delete so removing a
  -- game doesn't erase the historical "we added this" announcement.
  game_id uuid references public.games (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

drop policy if exists "Notifications are publicly readable" on public.notifications;
create policy "Notifications are publicly readable"
  on public.notifications for select
  using (true);

drop policy if exists "Admins can manage notifications" on public.notifications;
create policy "Admins can manage notifications"
  on public.notifications for all
  using (public.is_admin())
  with check (public.is_admin());

create index if not exists notifications_created_at_idx
  on public.notifications (created_at desc);
