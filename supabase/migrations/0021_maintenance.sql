-- MofiGames — Phase 21: Maintenance (Phase 5 of the Admin → Security
-- build-out — the last category from the original checklist: Security
-- Scanner/Health Check, Dependency Security Check, System Integrity
-- Check).
--
-- All three ride the existing automation job pattern from Phase 4
-- (automation_jobs + automation_job_runs already store a per-run
-- summary jsonb — that's exactly a "scan result," so no new result
-- tables are needed here). What IS new:
--   - Two SECURITY DEFINER report functions the health/integrity check
--     executors call — both need data an admin-session (non-service-role)
--     client can't reach directly: auth.mfa_factors lives outside the
--     exposed `public` schema, and pg_catalog/pg_policies, while
--     technically queryable, isn't exposed through PostgREST.
--   - Three new security_alerts.type values so a newly-failing check
--     shows up in Admin → Security → Alerts, not just the job log.
--
-- Run in Supabase SQL Editor. Safe to run multiple times.

-- ---------------------------------------------------------------------------
-- count_admins_without_mfa — used by the Security Health Check to flag
-- "N admins without 2FA enabled" (the enforcement gap noted in the
-- Phase 1-4 handoff: "Require 2FA for admins" is a stored setting, not
-- enforced). auth.mfa_factors isn't exposed via PostgREST, so this
-- reads it as SECURITY DEFINER and returns only a count.
-- ---------------------------------------------------------------------------
create or replace function public.count_admins_without_mfa()
returns int
language sql
security definer set search_path = public
stable
as $$
  select count(*)::int
  from public.profiles p
  where p.is_admin = true
    and not exists (
      select 1 from auth.mfa_factors f
      where f.user_id = p.id and f.status = 'verified'
    );
$$;

-- ---------------------------------------------------------------------------
-- system_integrity_report — used by the System Integrity Check to
-- confirm the tables this build-out depends on still exist, still have
-- row-level security turned on, and still have at least one policy
-- attached (a table with RLS enabled but zero policies silently denies
-- all access via PostgREST, which is its own kind of breakage worth
-- catching). Scope is deliberately just "the tables this project's own
-- migrations created" — not a general-purpose schema linter.
-- ---------------------------------------------------------------------------
create or replace function public.system_integrity_report()
returns jsonb
language plpgsql
security definer set search_path = public
stable
as $$
declare
  v_tables text[] := array[
    'profiles', 'games', 'categories', 'tags', 'pages', 'posts',
    'comments', 'automation_jobs', 'automation_job_runs',
    'security_settings', 'login_attempts', 'security_alerts',
    'rate_limit_hits', 'access_rules', 'api_keys', 'backup_restores'
  ];
  v_result jsonb := '[]'::jsonb;
  v_table text;
  v_exists boolean;
  v_rls boolean;
  v_policy_count int;
begin
  foreach v_table in array v_tables loop
    select exists (
      select 1 from pg_catalog.pg_tables where schemaname = 'public' and tablename = v_table
    ) into v_exists;

    if v_exists then
      select c.relrowsecurity into v_rls
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_table;

      select count(*)::int into v_policy_count
      from pg_catalog.pg_policies
      where schemaname = 'public' and tablename = v_table;
    else
      v_rls := false;
      v_policy_count := 0;
    end if;

    v_result := v_result || jsonb_build_object(
      'table', v_table,
      'exists', v_exists,
      'rlsEnabled', coalesce(v_rls, false),
      'policyCount', coalesce(v_policy_count, 0)
    );
  end loop;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- security_alerts gains three more types so a regression found by any
-- of the three Maintenance checks surfaces in Admin → Security → Alerts.
-- Raised either by an admin session (manual "Run now" — covered
-- explicitly below) or the cron job runner (service role, bypasses RLS).
-- ---------------------------------------------------------------------------
alter table public.security_alerts drop constraint if exists security_alerts_type_check;
alter table public.security_alerts add constraint security_alerts_type_check
  check (type in (
    'account_lockout', 'new_login', 'password_changed', 'mfa_enabled', 'mfa_disabled',
    'database_restored', 'backup_failed',
    'health_check_failed', 'vulnerable_dependency', 'integrity_check_failed'
  ));

drop policy if exists "Security events can be logged" on public.security_alerts;
create policy "Security events can be logged"
  on public.security_alerts for insert
  with check (
    type in ('account_lockout', 'new_login')
    or (auth.uid() = user_id and type in ('password_changed', 'mfa_enabled', 'mfa_disabled'))
    or (public.is_admin() and type in (
      'database_restored', 'backup_failed',
      'health_check_failed', 'vulnerable_dependency', 'integrity_check_failed'
    ))
  );

-- ---------------------------------------------------------------------------
-- Seed the three new jobs. Category 'Security' (new — distinct from the
-- existing 'Maintenance' category, which scheduled_db_cleanup/
-- scheduled_backups already use for general housekeeping) so they group
-- together on both the generic Automation dashboard and the dedicated
-- Admin → Security → Maintenance page. `on conflict do nothing` so
-- re-running this migration never clobbers an admin's saved schedule.
-- ---------------------------------------------------------------------------
insert into public.automation_jobs (key, name, category, description, schedule_cron, config) values
  ('security_health_check', 'Security Health Check', 'Security',
   'Scans current security settings, access rules, API/CORS config, backup encryption, and admin 2FA coverage for policy gaps.',
   '0 6 * * *', '{}'),
  ('dependency_security_check', 'Dependency Security Check', 'Security',
   'Checks every dependency in package.json against the npm registry''s known-vulnerability advisories.',
   '0 7 * * 1', '{}'),
  ('system_integrity_check', 'System Integrity Check', 'Security',
   'Confirms every table this project depends on still exists, has row-level security enabled, and has at least one policy attached.',
   '30 6 * * *', '{}')
on conflict (key) do nothing;
