-- MofiGames — real per-account playtime tracking.
-- Replaces the old Profile page "Hours Played" stat (and the Level/XP
-- progress bar it fed into), both of which were a fake number seeded off
-- the account id — never based on anything the person actually did, and
-- never zero for a brand-new account. This table is the real thing: every
-- account starts with no row (== 0 seconds), and the only way the number
-- moves is the add_play_seconds() RPC below, called from the client in
-- small increments while a game is actually being played (see
-- usePlayTimeTracking in src/lib/game-library.ts).
-- Run in Supabase Dashboard → SQL Editor. Safe to run multiple times.

create table if not exists public.play_time (
  user_id uuid primary key references auth.users (id) on delete cascade,
  total_seconds bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.play_time enable row level security;

drop policy if exists "Users can view their own play time" on public.play_time;
create policy "Users can view their own play time"
  on public.play_time for select
  using (auth.uid() = user_id);

-- Deliberately no insert/update/delete policy for regular users — every
-- write goes through add_play_seconds() (SECURITY DEFINER) below, so a
-- tampered client can only ever add small, server-validated increments to
-- its own row, never set an arbitrary total directly.

create or replace function public.add_play_seconds(seconds integer)
returns bigint
language plpgsql
security definer set search_path = public
as $$
declare
  new_total bigint;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- A single heartbeat should only ever report a small slice of real
  -- elapsed time (see HEARTBEAT_SECONDS client-side) — reject anything
  -- that couldn't legitimately come from that, whether from a client bug
  -- or a tampered request.
  if seconds <= 0 or seconds > 120 then
    raise exception 'Invalid seconds value';
  end if;

  insert into public.play_time (user_id, total_seconds, updated_at)
  values (auth.uid(), seconds, now())
  on conflict (user_id)
  do update set total_seconds = public.play_time.total_seconds + excluded.total_seconds,
                updated_at = now()
  returning total_seconds into new_total;

  return new_total;
end;
$$;

grant execute on function public.add_play_seconds(integer) to authenticated;
