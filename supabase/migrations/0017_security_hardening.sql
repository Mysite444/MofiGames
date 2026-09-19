-- MofiGames — Phase 17: Security hardening (Phase 1 of the Admin →
-- Security build-out: Core Auth Hardening).
-- Adds: configurable password/lockout/session policy, a queryable login
-- log (success + failure, pre-auth so lockout can be checked before a
-- session exists), and a security alerts feed for lockouts/new logins/
-- password changes. Two-factor auth deliberately has no table here — it
-- rides entirely on Supabase Auth's built-in TOTP MFA (auth.mfa_factors),
-- managed via supabase.auth.mfa.* from the app.
-- Run in Supabase SQL Editor. Safe to run multiple times.

-- ---------------------------------------------------------------------------
-- security_settings — a single-row table (Admin → Security → Settings).
-- Publicly readable (the password policy has to be visible to a
-- signed-out visitor filling in the signup form) but only an admin can
-- change it.
-- ---------------------------------------------------------------------------
create table if not exists public.security_settings (
  id boolean primary key default true,
  min_password_length int not null default 8 check (min_password_length between 6 and 128),
  require_uppercase boolean not null default true,
  require_lowercase boolean not null default true,
  require_number boolean not null default true,
  require_symbol boolean not null default false,
  max_failed_attempts int not null default 5 check (max_failed_attempts between 3 and 20),
  lockout_window_minutes int not null default 15 check (lockout_window_minutes between 1 and 1440),
  session_timeout_minutes int not null default 60 check (session_timeout_minutes between 5 and 1440),
  require_2fa_for_admins boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint security_settings_single_row check (id)
);

insert into public.security_settings (id) values (true) on conflict (id) do nothing;

alter table public.security_settings enable row level security;

drop policy if exists "Security settings are publicly readable" on public.security_settings;
create policy "Security settings are publicly readable"
  on public.security_settings for select
  using (true);

drop policy if exists "Admins can update security settings" on public.security_settings;
create policy "Admins can update security settings"
  on public.security_settings for update
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- login_attempts — every login attempt, success or failure, logged by the
-- login form itself (see src/lib/auth-context.tsx) before/after calling
-- Supabase Auth. Insertable by anyone, including a signed-out visitor —
-- that's the point: lockout has to be checkable, and a failed attempt has
-- to be logged, before any session exists. Readable only by staff.
-- ---------------------------------------------------------------------------
create table if not exists public.login_attempts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  user_id uuid references auth.users (id) on delete set null,
  success boolean not null,
  failure_reason text,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists login_attempts_email_created_at_idx
  on public.login_attempts (lower(email), created_at desc);
create index if not exists login_attempts_created_at_idx on public.login_attempts (created_at desc);

alter table public.login_attempts enable row level security;

drop policy if exists "Anyone can record a login attempt" on public.login_attempts;
create policy "Anyone can record a login attempt"
  on public.login_attempts for insert
  with check (true);

drop policy if exists "Staff can view login attempts" on public.login_attempts;
create policy "Staff can view login attempts"
  on public.login_attempts for select
  using (public.is_admin() or public.has_permission('view_activity_logs'));

-- ---------------------------------------------------------------------------
-- security_alerts — Admin → Security → Alerts. Auto-created for account
-- lockouts and (best-effort, IP-based) logins from a new location; a
-- signed-in user can also log a password-change/MFA event against their
-- own account. Lockout/new-login alerts have no session yet when they're
-- raised, so those two types are insertable without auth; the rest
-- require the caller to be the account in question.
-- ---------------------------------------------------------------------------
create table if not exists public.security_alerts (
  id uuid primary key default gen_random_uuid(),
  type text not null check (
    type in ('account_lockout', 'new_login', 'password_changed', 'mfa_enabled', 'mfa_disabled')
  ),
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  user_id uuid references auth.users (id) on delete cascade,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  resolved boolean not null default false,
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists security_alerts_created_at_idx on public.security_alerts (created_at desc);
create index if not exists security_alerts_resolved_idx on public.security_alerts (resolved, created_at desc);

alter table public.security_alerts enable row level security;

drop policy if exists "Security events can be logged" on public.security_alerts;
create policy "Security events can be logged"
  on public.security_alerts for insert
  with check (
    type in ('account_lockout', 'new_login')
    or (auth.uid() = user_id and type in ('password_changed', 'mfa_enabled', 'mfa_disabled'))
  );

drop policy if exists "Staff can view security alerts" on public.security_alerts;
create policy "Staff can view security alerts"
  on public.security_alerts for select
  using (public.is_admin() or public.has_permission('view_activity_logs'));

drop policy if exists "Staff can resolve security alerts" on public.security_alerts;
create policy "Staff can resolve security alerts"
  on public.security_alerts for update
  using (public.is_admin() or public.has_permission('view_activity_logs'))
  with check (public.is_admin() or public.has_permission('view_activity_logs'));
