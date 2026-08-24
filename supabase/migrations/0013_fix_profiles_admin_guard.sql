-- MofiGames — Phase 13: fix the User Management bootstrap bug.
-- Run in Supabase SQL Editor. Safe to run multiple times.
--
-- Bug: profiles_before_update_guard() (0012) has no auth.uid() session when
-- an update comes from the SQL Editor, Table Editor, or a service-role
-- call — there's no logged-in user. That made it impossible to grant the
-- first (or any new) admin/staff role directly from Supabase:
--   - `update profiles set role = 'admin' ...` raised "Only admins can
--     change a user's role", since is_admin() is false with no session.
--   - `update profiles set is_admin = true ...` didn't error, but the
--     trigger's own `new.is_admin := (new.role = 'admin')` line silently
--     reverted it back to false in the same statement, since role itself
--     was never touched.
-- Fix: skip the guard entirely when auth.uid() is null — that path is
-- never reachable by a regular user through the app, only by someone with
-- direct database access, so it's safe to trust.

create or replace function public.profiles_before_update_guard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
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

-- Now actually grant yourself admin. Replace the uuid below with your own
-- auth.users id (Supabase Dashboard → Authentication → Users → copy the
-- UID), then run this statement on its own.
-- update public.profiles set role = 'admin', is_admin = true where id = '00000000-0000-0000-0000-000000000000';
