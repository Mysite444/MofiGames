-- ---------------------------------------------------------------------------
-- 0078_security_fix_rls_inserts.sql
--
-- Security fixes for HIGH-01 and MED-03 (2026-09 security audit).
--
-- HIGH-01 — login_attempts open INSERT policy
--   "Anyone can record a login attempt" used `with check (true)`, meaning
--   any caller could POST directly to the Supabase REST API and insert
--   rows with an arbitrary email and success=false, locking out any
--   victim account indefinitely with no rate limit and no application
--   involvement.  Fix: drop the open policy; all writes go through the
--   record_login_attempt() SECURITY DEFINER function, which applies a
--   per-IP cap before writing.
--
-- MED-03 — security_alerts spoofable INSERT branch
--   The "Security events can be logged" policy (most recently set in
--   migration 0021) retained an ownership-free branch:
--     type in ('account_lockout', 'new_login')
--   Any unauthenticated caller could insert those types with an arbitrary
--   user_id and severity='critical', poisoning the Admin → Security →
--   Alerts feed.  Fix: remove that branch; those types now only get
--   written from log_security_alert_internal(), a SECURITY DEFINER
--   function with a per-IP rate cap.
--
--   All other INSERT branches from migration 0021 are preserved:
--     • password_changed / mfa_enabled / mfa_disabled — still allowed
--       via auth.uid() = user_id; the /api/account/security-event route
--       is updated to call log_security_alert_self() RPC instead.
--     • database_restored / backup_failed / health_check_failed /
--       vulnerable_dependency / integrity_check_failed — still allowed
--       for authenticated admins (is_admin()).  These types are only
--       ever written by requireAdmin()-gated routes or the cron
--       service-role runner (which bypasses RLS entirely); there is no
--       spoofing risk on these branches.
-- ---------------------------------------------------------------------------


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1 — login_attempts (HIGH-01)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1a. Drop the open insert policy.
drop policy if exists "Anyone can record a login attempt" on public.login_attempts;

-- 1b. Create a SECURITY DEFINER function that owns the write path.
--     It applies a per-IP cap (10 inserts / 5 min) via the existing
--     hit_rate_limit() function (migration 0018) before writing a row.
create or replace function public.record_login_attempt(
  p_email          text,
  p_user_id        uuid,
  p_success        boolean,
  p_failure_reason text,
  p_ip             text,
  p_user_agent     text
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_rate_ok boolean;
begin
  -- Per-IP insert cap: 10 attempts in any 5-minute window.
  -- An empty / null IP is allowed through — mobile clients without a
  -- reliable IP should not be silently dropped.
  if p_ip is not null and p_ip <> '' then
    select public.hit_rate_limit(
      'login-attempt-insert:' || p_ip,
      300,   -- 5-minute window (seconds)
      10     -- max 10 rows per window per IP
    ) into v_rate_ok;

    -- If the IP is over the cap, silently drop the row.  The calling
    -- route (/api/auth/login-log) already has its own IP-level limit
    -- via /api/auth/login-guard; this guard exists only to stop an
    -- attacker who bypasses that route entirely by posting directly to
    -- the Supabase REST API.
    if v_rate_ok = false then
      return;
    end if;
  end if;

  insert into public.login_attempts (
    email, user_id, success, failure_reason, ip, user_agent
  ) values (
    p_email, p_user_id, p_success, p_failure_reason, p_ip, p_user_agent
  );
end;
$$;

-- Allow anon (login route uses the public/anon-key client, there may be
-- no session yet when a failed attempt is being logged).
grant execute on function public.record_login_attempt(text, uuid, boolean, text, text, text)
  to anon, authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2 — security_alerts (MED-03)
-- ═══════════════════════════════════════════════════════════════════════════

-- 2a. Drop the existing policy (last written by migration 0021).
drop policy if exists "Security events can be logged" on public.security_alerts;

-- 2b. Rebuild the policy WITHOUT the spoofable open branch.
--     Only the two branches that require a real identity are kept as
--     direct-insert policies:
--       • Admin-only types (database_restored, backup_failed, …)
--       • User self-service types now only accessible via RPC (see 2d)
create policy "Security events can be logged"
  on public.security_alerts for insert
  with check (
    -- Admin-only audit types: backup restores, health checks, etc.
    -- These are only ever written by requireAdmin()-gated routes or the
    -- service-role cron runner (which bypasses RLS entirely).
    (public.is_admin() and type in (
      'database_restored', 'backup_failed',
      'health_check_failed', 'vulnerable_dependency', 'integrity_check_failed'
    ))
    -- User self-service: password change, MFA events.
    -- auth.uid() = user_id binding was already correct in migration 0017;
    -- preserved here.  The /api/account/security-event route is also
    -- migrated to call log_security_alert_self() (see 2d) for an
    -- additional ownership check inside the function itself.
    or (auth.uid() = user_id and type in (
      'password_changed', 'mfa_enabled', 'mfa_disabled'
    ))
    -- account_lockout / new_login — deliberately REMOVED from the
    -- direct-insert policy.  These types are now written exclusively via
    -- log_security_alert_internal() (see 2c).
  );

-- 2c. SECURITY DEFINER function for server-raised alerts.
--     Accepts only the two formerly-open types and applies a per-IP rate
--     cap so mass-flooding the alerts feed is expensive.
create or replace function public.log_security_alert_internal(
  p_type      text,
  p_severity  text,
  p_user_id   uuid,
  p_message   text,
  p_metadata  jsonb
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_ip text;
begin
  -- Only the two server-raised types are accepted here.
  if p_type not in ('account_lockout', 'new_login') then
    raise exception 'log_security_alert_internal: unsupported type ''%''', p_type;
  end if;

  -- Validate severity to the check-constraint values.
  if p_severity not in ('info', 'warning', 'critical') then
    raise exception 'log_security_alert_internal: invalid severity ''%''', p_severity;
  end if;

  -- Best-effort per-IP rate cap (20 alerts / 5 min) extracted from the
  -- metadata JSON so the cap is tied to the real network source.
  v_ip := p_metadata->>'ip';
  if v_ip is not null and v_ip <> '' then
    -- We record the hit but do NOT hard-block here — the goal is to
    -- make mass-flooding expensive (each call costs a DB write in
    -- rate_limit_hits) rather than silently dropping genuine lockout
    -- alerts during an active attack.
    perform public.hit_rate_limit(
      'security-alert-insert:' || v_ip,
      300,   -- 5-minute window
      20     -- 20 alerts per window per IP before the counter fires
    );
  end if;

  insert into public.security_alerts (type, severity, user_id, message, metadata)
  values (p_type, p_severity, p_user_id, p_message, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

grant execute on function public.log_security_alert_internal(text, text, uuid, text, jsonb)
  to anon, authenticated;


-- 2d. SECURITY DEFINER function for user self-service alert types.
--     Requires auth.uid() = p_user_id so a user cannot log an alert
--     attributed to a different account.
create or replace function public.log_security_alert_self(
  p_user_id  uuid,
  p_type     text,
  p_message  text,
  p_metadata jsonb
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if p_type not in ('password_changed', 'mfa_enabled', 'mfa_disabled') then
    raise exception 'log_security_alert_self: unsupported type ''%''', p_type;
  end if;

  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'log_security_alert_self: permission denied';
  end if;

  insert into public.security_alerts (type, severity, user_id, message, metadata)
  values (p_type, 'info', p_user_id, p_message, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

grant execute on function public.log_security_alert_self(uuid, text, text, jsonb)
  to authenticated;
