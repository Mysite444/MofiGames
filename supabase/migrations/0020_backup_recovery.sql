-- MofiGames — Phase 20: Backup & Recovery (Phase 4 of the Admin →
-- Security build-out).
--
-- Scope note: Automatic Daily Backups, Backup Scheduling, and Manual
-- Backup already exist as of migration 0016 (the `scheduled_backups`
-- automation job + the `automation-backups` storage bucket) — this
-- migration doesn't touch that pipeline's schema, only adds what's new:
-- an audit trail for restores (a destructive-ish action deserves its own
-- log, not just a line in the general job-run history) and a couple of
-- new security_alerts types so a restore shows up in Admin → Security →
-- Alerts.
--
-- Run in Supabase SQL Editor. Safe to run multiple times.

-- ---------------------------------------------------------------------------
-- backup_restores — Admin → Security → Backups → restore history. One
-- row per restore attempt, whether it fully succeeded, partially
-- succeeded (one table failed, others didn't), or failed outright.
-- ---------------------------------------------------------------------------
create table if not exists public.backup_restores (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  row_counts jsonb not null default '{}'::jsonb,
  error text,
  restored_by uuid references auth.users (id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists backup_restores_started_at_idx on public.backup_restores (started_at desc);

alter table public.backup_restores enable row level security;

drop policy if exists "Admins can manage backup restores" on public.backup_restores;
create policy "Admins can manage backup restores"
  on public.backup_restores for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- security_alerts.type gains two more values so a restore (an inherently
-- notable event) and a backup failure both show up in Admin → Security →
-- Alerts, not just buried in the automation job log.
-- ---------------------------------------------------------------------------
alter table public.security_alerts drop constraint if exists security_alerts_type_check;
alter table public.security_alerts add constraint security_alerts_type_check
  check (type in (
    'account_lockout', 'new_login', 'password_changed', 'mfa_enabled', 'mfa_disabled',
    'database_restored', 'backup_failed'
  ));

-- Both new types are raised either by an admin-session route (restore)
-- or the cron job runner (service role, which bypasses RLS outright) —
-- this just covers the admin-session case explicitly.
drop policy if exists "Security events can be logged" on public.security_alerts;
create policy "Security events can be logged"
  on public.security_alerts for insert
  with check (
    type in ('account_lockout', 'new_login')
    or (auth.uid() = user_id and type in ('password_changed', 'mfa_enabled', 'mfa_disabled'))
    or (public.is_admin() and type in ('database_restored', 'backup_failed'))
  );
