-- ---------------------------------------------------------------------------
-- 0079_security_fix_copyright_rls.sql
--
-- Security fix for M-1 (2026-09 security audit, second pass).
--
-- Problem:
--   The "Anyone can file a copyright claim" RLS policy on user_reports
--   (migration 0015) used `with check (kind in ('copyright','dmca',
--   'counter_notice'))`.  Any caller — including a fully unauthenticated
--   request sent directly to the Supabase REST API with the public anon
--   key — could insert into user_reports without going through the Next.js
--   route or its Zod validation, and with no rate limiting at any layer.
--   An attacker could flood Admin → Reports → Copyright/DMCA/Counter-Notices
--   with junk, burying real legal notices.
--
-- Fix:
--   Drop the open INSERT policy.  All public copyright-claim writes now go
--   through file_copyright_claim(), a SECURITY DEFINER function that applies
--   a per-IP rate cap (20 submissions / 10 minutes) before writing the row.
--   The cap is generous enough for any legitimate rights-holder workflow and
--   aggressive enough to stop automated flooding.
--
--   This is the same pattern as migration 0078 (record_login_attempt for
--   login_attempts) — a SECURITY DEFINER function callable by anon with a
--   rate-cap guard replaces a direct-insert policy.
-- ---------------------------------------------------------------------------

-- 1. Drop the open INSERT policy.
drop policy if exists "Anyone can file a copyright claim" on public.user_reports;


-- 2. SECURITY DEFINER function — the only path to insert copyright/DMCA/
--    counter-notice rows for public callers.
create or replace function public.file_copyright_claim(
  p_kind                           text,
  p_reporter_id                    uuid,
  p_details                        text,
  p_claimant_name                  text,
  p_claimant_email                 text,
  p_copyrighted_work_description   text,
  p_infringing_url                 text,
  p_sworn_statement                boolean,
  p_related_report_id              uuid,
  p_ip                             text
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_rate_ok boolean;
begin
  -- Validate kind — the only types this function accepts.
  if p_kind not in ('copyright', 'dmca', 'counter_notice') then
    raise exception 'file_copyright_claim: unsupported kind ''%''', p_kind;
  end if;

  -- Per-IP rate cap: 20 submissions per 10-minute window.
  -- Generous for any legitimate workflow; stops automated flooding.
  if p_ip is not null and p_ip <> '' then
    select public.hit_rate_limit(
      'copyright-claim:' || p_ip,
      600,   -- 10-minute window (seconds)
      20     -- max 20 submissions per window per IP
    ) into v_rate_ok;

    if v_rate_ok = false then
      raise exception 'file_copyright_claim: rate limit exceeded for IP %', p_ip;
    end if;
  end if;

  -- Enforce the sworn-statement rule at the database layer too (the Next.js
  -- route already checks this via Zod, but belt-and-suspenders for direct
  -- RPC callers — e.g. a future mobile client).
  if p_kind <> 'counter_notice' and p_sworn_statement is not true then
    raise exception 'file_copyright_claim: sworn_statement required for kind %', p_kind;
  end if;

  insert into public.user_reports (
    kind,
    reporter_id,
    reported_user_id,
    reason,
    details,
    category_key,
    claimant_name,
    claimant_email,
    copyrighted_work_description,
    infringing_url,
    sworn_statement,
    related_report_id
  ) values (
    p_kind,
    p_reporter_id,
    null,
    null,
    p_details,
    p_kind,
    p_claimant_name,
    p_claimant_email,
    p_copyrighted_work_description,
    p_infringing_url,
    p_sworn_statement,
    p_related_report_id
  );
end;
$$;

-- Allow anon + authenticated callers (rights holders may not have accounts).
grant execute on function public.file_copyright_claim(
  text, uuid, text, text, text, text, text, boolean, uuid, text
) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- PART 2: Restrict the user-kind INSERT policy to kind='user' only.
--
-- Migration 0012 created "Users can file a report" with no kind restriction.
-- That means an authenticated user could still bypass file_copyright_claim()
-- (and its rate cap) by calling the Supabase REST API directly with their
-- auth token and kind='copyright'.
--
-- Fix: rewrite the policy to explicitly restrict it to kind='user'.
-- Copyright/DMCA/counter-notice rows must now go through the RPC for ALL
-- callers — both authenticated and unauthenticated.
-- ---------------------------------------------------------------------------

drop policy if exists "Users can file a report" on public.user_reports;
create policy "Users can file a report"
  on public.user_reports for insert
  with check (
    auth.uid() = reporter_id
    and not public.is_banned()
    and reported_user_id <> auth.uid()
    and kind = 'user'
  );
