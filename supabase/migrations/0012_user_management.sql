-- MofiGames — Phase 12: User Management.
-- Adds a new Admin → User Management section: Users, Roles & Permissions,
-- Banned Users, User Reports, User Verification, Login & Session
-- Management, and User Activity Logs.
-- Run in Supabase SQL Editor. Safe to run multiple times.

-- ---------------------------------------------------------------------------
-- Roles. `profiles.is_admin` (migration 0003) stays exactly as-is — every
-- existing RLS policy across every prior migration calls public.is_admin(),
-- and the app's own auth-context/route-auth read the raw column directly.
-- Rather than touch any of that, `role` is added alongside it, and a
-- trigger below keeps is_admin in permanent lockstep with role = 'admin' —
-- so going forward, `role` is the single source of truth (set it via the
-- Users screen) and `is_admin` just mirrors it for backward compatibility.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists role text not null default 'user'
  check (role in ('user', 'moderator', 'editor', 'admin'));

update public.profiles set role = 'admin' where is_admin = true and role <> 'admin';

-- ---------------------------------------------------------------------------
-- Permissions. A small, fixed set of capabilities that moderator/editor can
-- be granted beyond their role defaults (admins always have everything —
-- see has_permission() below). role_permissions is the default matrix
-- (Admin → User Management → Roles & Permissions); user_permission_overrides
-- lets a specific person be granted or explicitly denied a permission
-- regardless of their role's default.
--
-- The permission catalog lives in src/lib/permissions.ts (kept in sync with
-- the check constraint below by hand — there are only 5, this is simpler
-- and more visible than a separate reference table).
-- ---------------------------------------------------------------------------

-- Small helper so policies below can read a role without every policy
-- re-deriving it inline. STABLE + SECURITY DEFINER, same shape as
-- is_admin() — defined first since the policies just below call it.
create or replace function public.profiles_role()
returns text
language sql
security definer set search_path = public
stable
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'user');
$$;

create table if not exists public.role_permissions (
  role text not null check (role in ('moderator', 'editor')),
  permission text not null check (
    permission in ('ban_users', 'verify_users', 'manage_reports', 'view_activity_logs', 'moderate_comments')
  ),
  primary key (role, permission)
);

alter table public.role_permissions enable row level security;

drop policy if exists "Role permissions are readable by staff" on public.role_permissions;
create policy "Role permissions are readable by staff"
  on public.role_permissions for select
  using (public.is_admin() or public.profiles_role() in ('moderator', 'editor'));

drop policy if exists "Admins can manage role permissions" on public.role_permissions;
create policy "Admins can manage role permissions"
  on public.role_permissions for all
  using (public.is_admin())
  with check (public.is_admin());

create table if not exists public.user_permission_overrides (
  user_id uuid not null references auth.users (id) on delete cascade,
  permission text not null check (
    permission in ('ban_users', 'verify_users', 'manage_reports', 'view_activity_logs', 'moderate_comments')
  ),
  granted boolean not null,
  created_at timestamptz not null default now(),
  primary key (user_id, permission)
);

alter table public.user_permission_overrides enable row level security;

drop policy if exists "Admins can manage permission overrides" on public.user_permission_overrides;
create policy "Admins can manage permission overrides"
  on public.user_permission_overrides for all
  using (public.is_admin())
  with check (public.is_admin());

-- The single function everything (RLS policies, API routes via .rpc(),
-- triggers below) calls to answer "can the current user do X". Admins
-- always pass. A per-user override always wins over the role default when
-- one exists; otherwise it falls back to whatever role_permissions grants
-- that role.
create or replace function public.has_permission(perm text)
returns boolean
language plpgsql
security definer set search_path = public
stable
as $$
declare
  v_role text;
  v_override boolean;
begin
  if public.is_admin() then
    return true;
  end if;

  select granted into v_override
  from public.user_permission_overrides
  where user_id = auth.uid() and permission = perm;

  if found then
    return v_override;
  end if;

  select role into v_role from public.profiles where id = auth.uid();

  return exists (
    select 1 from public.role_permissions
    where role = v_role and permission = perm
  );
end;
$$;

grant execute on function public.has_permission(text) to authenticated;

-- Sensible starting defaults — fully editable afterwards from Admin →
-- User Management → Roles & Permissions.
insert into public.role_permissions (role, permission) values
  ('moderator', 'ban_users'),
  ('moderator', 'manage_reports'),
  ('moderator', 'view_activity_logs'),
  ('moderator', 'moderate_comments'),
  ('editor', 'verify_users'),
  ('editor', 'view_activity_logs')
on conflict (role, permission) do nothing;

-- ---------------------------------------------------------------------------
-- Bans, verification — more columns on profiles. `is_banned()` treats an
-- expired ban_expires_at as not-banned automatically (checked live, not by
-- a background job) — a temporary ban simply stops applying once its
-- clock runs out, with nothing that needs to run to "lift" it.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists is_banned boolean not null default false;
alter table public.profiles add column if not exists ban_reason text;
alter table public.profiles add column if not exists banned_at timestamptz;
alter table public.profiles add column if not exists ban_expires_at timestamptz;
alter table public.profiles add column if not exists banned_by uuid references auth.users (id) on delete set null;

alter table public.profiles add column if not exists is_verified boolean not null default false;
alter table public.profiles add column if not exists verified_at timestamptz;
alter table public.profiles add column if not exists verified_by uuid references auth.users (id) on delete set null;

create or replace function public.is_banned()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select coalesce(
    (
      select is_banned and (ban_expires_at is null or ban_expires_at > now())
      from public.profiles
      where id = auth.uid()
    ),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- Guard trigger — without this, the existing "Users can update their own
-- profile" policy (migration 0001, still auth.uid() = id with no column
-- restriction) would let anyone flip their own is_banned/role/is_verified
-- straight back off. This runs before every profiles update and:
--  1. blocks changes to role/ban/verification columns unless the caller
--     has the right permission for that specific change, then
--  2. keeps is_admin mirrored to role = 'admin' (see top of file).
-- Admin-panel routes (which run as the acting admin/moderator's own
-- session) pass through fine since has_permission()/is_admin() checks
-- their real session; a regular user's own-profile update never touches
-- these columns so it's untouched by this trigger.
-- ---------------------------------------------------------------------------
create or replace function public.profiles_before_update_guard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- No authenticated session (SQL Editor, Table Editor, or a service-role
  -- call) — this path is never reachable by a regular user through the
  -- app, so it's safe to skip the guard entirely. Without this, there is
  -- no way to bootstrap the very first admin (or fix a broken one) from
  -- the Supabase dashboard: setting role = 'admin' directly gets rejected
  -- by the check below (auth.uid() is null, so is_admin() is false), and
  -- setting is_admin = true directly gets silently reverted by the
  -- `new.is_admin := (new.role = 'admin')` line further down, since role
  -- itself was never touched.
  if auth.uid() is null then
    new.is_admin := (new.role = 'admin');
    return new;
  end if;

  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only admins can change a user''s role';
  end if;

  if (
    new.is_banned is distinct from old.is_banned
    or new.ban_reason is distinct from old.ban_reason
    or new.banned_at is distinct from old.banned_at
    or new.ban_expires_at is distinct from old.ban_expires_at
    or new.banned_by is distinct from old.banned_by
  ) and not (public.is_admin() or public.has_permission('ban_users')) then
    raise exception 'You do not have permission to change ban status';
  end if;

  if (
    new.is_verified is distinct from old.is_verified
    or new.verified_at is distinct from old.verified_at
    or new.verified_by is distinct from old.verified_by
  ) and not (public.is_admin() or public.has_permission('verify_users')) then
    raise exception 'You do not have permission to change verification status';
  end if;

  new.is_admin := (new.role = 'admin');

  return new;
end;
$$;

drop trigger if exists profiles_before_update_guard on public.profiles;
create trigger profiles_before_update_guard
  before update on public.profiles
  for each row execute function public.profiles_before_update_guard();

-- The original "Users can update their own profile" policy (migration
-- 0001) only ever allowed auth.uid() = id — an admin/moderator/editor
-- updating someone ELSE's row (banning them, changing their role, etc.)
-- would be blocked at the row level before the trigger above even gets a
-- chance to check columns. This policy is intentionally broad at the row
-- level (any staff member with any one of these permissions can attempt
-- an update on any profile) — the trigger above is what actually narrows
-- *which columns* they're allowed to change, so a moderator with only
-- ban_users still can't sneak a role change through this policy.
drop policy if exists "Staff can update any profile" on public.profiles;
create policy "Staff can update any profile"
  on public.profiles for update
  using (public.is_admin() or public.has_permission('ban_users') or public.has_permission('verify_users'))
  with check (public.is_admin() or public.has_permission('ban_users') or public.has_permission('verify_users'));

-- ---------------------------------------------------------------------------
-- Block banned users from the main abuse surfaces. Existing insert
-- policies (migrations 0002, 0004, 0008) are redefined here to add the
-- same "not banned" condition, same idempotent drop/create pattern those
-- migrations already use for their own updates.
-- ---------------------------------------------------------------------------
drop policy if exists "Users can post their own comments" on public.comments;
create policy "Users can post their own comments"
  on public.comments for insert
  with check (auth.uid() = user_id and not public.is_banned());

drop policy if exists "Users can like comments as themselves" on public.comment_likes;
create policy "Users can like comments as themselves"
  on public.comment_likes for insert
  with check (auth.uid() = user_id and not public.is_banned());

drop policy if exists "Users can add their own favorites" on public.favorites;
create policy "Users can add their own favorites"
  on public.favorites for insert
  with check (auth.uid() = user_id and not public.is_banned());

drop policy if exists "Users can rate a game" on public.game_ratings;
create policy "Users can rate a game"
  on public.game_ratings for insert
  with check (auth.uid() = user_id and not public.is_banned());

-- Let a moderator (or anyone granted 'moderate_comments') delete any
-- comment too, not just admins — redefines the migration-0005 policy.
drop policy if exists "Admins can delete any comment" on public.comments;
create policy "Admins can delete any comment"
  on public.comments for delete
  using (public.is_admin() or public.has_permission('moderate_comments'));

-- ---------------------------------------------------------------------------
-- user_reports — one user reporting another (optionally in the context of
-- a specific comment/game) for review by staff.
-- ---------------------------------------------------------------------------
create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users (id) on delete set null,
  reported_user_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (
    reason in ('spam', 'harassment', 'inappropriate_content', 'impersonation', 'other')
  ),
  details text not null default '' check (char_length(details) <= 2000),
  context_game_slug text,
  context_comment_id uuid references public.comments (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'resolved', 'dismissed')),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_reports_status_created_at_idx on public.user_reports (status, created_at desc);
create index if not exists user_reports_reported_user_id_idx on public.user_reports (reported_user_id);

alter table public.user_reports enable row level security;

drop policy if exists "Users can file a report" on public.user_reports;
create policy "Users can file a report"
  on public.user_reports for insert
  with check (auth.uid() = reporter_id and not public.is_banned() and reported_user_id <> auth.uid());

drop policy if exists "Staff can view reports" on public.user_reports;
create policy "Staff can view reports"
  on public.user_reports for select
  using (public.is_admin() or public.has_permission('manage_reports'));

drop policy if exists "Staff can update reports" on public.user_reports;
create policy "Staff can update reports"
  on public.user_reports for update
  using (public.is_admin() or public.has_permission('manage_reports'))
  with check (public.is_admin() or public.has_permission('manage_reports'));

-- ---------------------------------------------------------------------------
-- user_activity_logs — a real, queryable trail. Populated by the app for
-- high-signal events: sign-in/sign-up (client, right after auth) and staff
-- actions taken on an account (role change, ban/unban, verify/unverify,
-- permission override). Deliberately NOT populated per game-play or per-
-- comment — those already have their own dedicated views (Analytics, and
-- the Comments moderation list) and logging every play here would make
-- this table balloon for very little extra signal.
-- ---------------------------------------------------------------------------
create table if not exists public.user_activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  activity_type text not null,
  description text not null default '',
  actor_id uuid references auth.users (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists user_activity_logs_user_id_created_at_idx
  on public.user_activity_logs (user_id, created_at desc);
create index if not exists user_activity_logs_created_at_idx on public.user_activity_logs (created_at desc);

alter table public.user_activity_logs enable row level security;

drop policy if exists "Users can log their own activity" on public.user_activity_logs;
create policy "Users can log their own activity"
  on public.user_activity_logs for insert
  with check (
    auth.uid() = user_id
    or public.is_admin()
    or public.has_permission('ban_users')
    or public.has_permission('verify_users')
  );

drop policy if exists "Staff can view activity logs" on public.user_activity_logs;
create policy "Staff can view activity logs"
  on public.user_activity_logs for select
  using (
    auth.uid() = user_id or public.is_admin() or public.has_permission('view_activity_logs')
  );
