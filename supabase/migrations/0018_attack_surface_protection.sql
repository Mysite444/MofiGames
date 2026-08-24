-- MofiGames — Phase 18: Attack surface protection (Phase 2 of the Admin →
-- Security build-out).
--
-- Also fixes a real bug from migration 0017: login-guard/login-log read
-- login_attempts through the anon key, but the SELECT policy on that
-- table only allows staff — so an unauthenticated request always saw
-- zero rows and lockout/new-login detection was silently a no-op. The
-- SECURITY DEFINER counters below fix that without loosening who can
-- browse the raw log in Admin → Security → Login Logs.
--
-- Run in Supabase SQL Editor. Safe to run multiple times.

-- ---------------------------------------------------------------------------
-- Fix: counters usable by an anonymous caller, bypassing the
-- staff-only SELECT policy on login_attempts by design (SECURITY
-- DEFINER), while returning only a count/boolean — never row contents.
-- ---------------------------------------------------------------------------
create or replace function public.count_recent_login_failures(p_email text, p_window_minutes int)
returns int
language sql
security definer set search_path = public
stable
as $$
  select count(*)::int
  from public.login_attempts
  where lower(email) = lower(p_email)
    and success = false
    and created_at >= now() - (p_window_minutes || ' minutes')::interval;
$$;

create or replace function public.count_successful_logins_from_ip(p_email text, p_ip text)
returns int
language sql
security definer set search_path = public
stable
as $$
  select count(*)::int
  from public.login_attempts
  where lower(email) = lower(p_email)
    and success = true
    and ip = p_ip;
$$;

-- ---------------------------------------------------------------------------
-- rate_limit_hits — one row per rate-limited event (login tries, signups,
-- report submissions, etc). hit_rate_limit() records the hit and reports
-- whether the caller is still under the limit, atomically. No RLS
-- policies at all on the table itself — every access goes through the
-- SECURITY DEFINER function below, anon included.
-- ---------------------------------------------------------------------------
create table if not exists public.rate_limit_hits (
  id bigint generated always as identity primary key,
  key text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_hits_key_created_at_idx on public.rate_limit_hits (key, created_at desc);

alter table public.rate_limit_hits enable row level security;

create or replace function public.hit_rate_limit(p_key text, p_window_seconds int, p_max int)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.rate_limit_hits (key) values (p_key);

  select count(*) into v_count
  from public.rate_limit_hits
  where key = p_key
    and created_at >= now() - (p_window_seconds || ' seconds')::interval;

  -- Best-effort cleanup so this table doesn't grow forever — cheap
  -- (indexed on key) and only touches rows well outside any realistic
  -- rate-limit window.
  delete from public.rate_limit_hits
  where key = p_key and created_at < now() - interval '1 day';

  return v_count <= p_max;
end;
$$;

-- ---------------------------------------------------------------------------
-- access_rules — Admin → Security → Access Control. IP and country
-- allow/block rules, enforced in middleware on every request. A value
-- that matches a 'block' rule is denied; if any 'allow' rules exist for
-- a rule_type, that type switches to allowlist mode (only matching
-- values pass, everything else is denied).
-- ---------------------------------------------------------------------------
create table if not exists public.access_rules (
  id uuid primary key default gen_random_uuid(),
  rule_type text not null check (rule_type in ('ip', 'country')),
  mode text not null check (mode in ('block', 'allow')),
  value text not null,
  reason text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists access_rules_unique_idx on public.access_rules (rule_type, mode, value);

alter table public.access_rules enable row level security;

drop policy if exists "Admins can manage access rules" on public.access_rules;
create policy "Admins can manage access rules"
  on public.access_rules for all
  using (public.is_admin())
  with check (public.is_admin());

-- Callable by anyone, including anon from middleware — returns 'block' or
-- 'allow' rather than exposing the rule rows themselves. Fails open
-- (returns 'allow') whenever a value is null, e.g. no country header
-- present on a non-Vercel host — a broken/absent signal should never be
-- the reason the whole site goes down.
create or replace function public.check_access(p_ip text, p_country text)
returns text
language plpgsql
security definer set search_path = public
stable
as $$
declare
  v_ip_allowlist_exists boolean;
  v_country_allowlist_exists boolean;
begin
  if p_ip is not null and exists (
    select 1 from public.access_rules where rule_type = 'ip' and mode = 'block' and value = p_ip
  ) then
    return 'block';
  end if;

  if p_country is not null and exists (
    select 1 from public.access_rules where rule_type = 'country' and mode = 'block' and value = p_country
  ) then
    return 'block';
  end if;

  select exists (select 1 from public.access_rules where rule_type = 'ip' and mode = 'allow') into v_ip_allowlist_exists;
  if v_ip_allowlist_exists and p_ip is not null and not exists (
    select 1 from public.access_rules where rule_type = 'ip' and mode = 'allow' and value = p_ip
  ) then
    return 'block';
  end if;

  select exists (select 1 from public.access_rules where rule_type = 'country' and mode = 'allow') into v_country_allowlist_exists;
  if v_country_allowlist_exists and p_country is not null and not exists (
    select 1 from public.access_rules where rule_type = 'country' and mode = 'allow' and value = p_country
  ) then
    return 'block';
  end if;

  return 'allow';
end;
$$;
