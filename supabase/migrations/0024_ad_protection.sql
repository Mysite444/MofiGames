-- MofiGames — Phase 24: Ad Protection (Admin → Monetization → Ad
-- Protection). Adds invalid-traffic detection and self-protection for the
-- ad placements defined in ad_settings (migration 0023): click/impression
-- frequency limiting, bot/VPN/proxy/datacenter signals, a whitelist/
-- blacklist, an event log that backs the Traffic Quality Dashboard, CTR
-- Monitoring, Click Heatmap, and Invalid Traffic Reports, plus an audit
-- log of anything the system did on its own (Auto Ad Disable / Auto IP
-- Blocking).
--
-- Scope note: this protects the site's own traffic-quality signals and
-- decides when *we* stop rendering an ad slot to a visitor — it does not
-- (and cannot) intercept or re-classify clicks inside a third-party ad
-- network's own iframe (e.g. AdSense), which is cross-origin and outside
-- any publisher's reach by design. VPN/proxy/datacenter detection is a
-- free heuristic (IP-range lists below), not a paid-API lookup — expect
-- decent but imperfect accuracy; real hits still are not proof of intent.
--
-- Run in Supabase SQL Editor. Safe to run multiple times.

-- ---------------------------------------------------------------------------
-- ad_protection_settings — one toggle/threshold per feature on the Ad
-- Protection settings screen. Same singleton shape as ad_settings.
-- Publicly readable: the public site's ad slots need to know (a) whether
-- click/impression tracking is even active and (b) enough of the
-- thresholds to self-limit before firing a request. Admin-only to write.
-- ---------------------------------------------------------------------------
create table if not exists public.ad_protection_settings (
  id boolean primary key default true,

  invalid_click_detection_enabled boolean not null default true,

  click_frequency_limit_enabled boolean not null default true,
  click_frequency_max integer not null default 5,
  click_frequency_window_seconds integer not null default 60,

  impression_frequency_limit_enabled boolean not null default true,
  impression_frequency_max integer not null default 30,
  impression_frequency_window_seconds integer not null default 60,

  suspicious_user_detection_enabled boolean not null default true,
  bot_detection_enabled boolean not null default true,
  vpn_proxy_detection_enabled boolean not null default true,
  datacenter_ip_detection_enabled boolean not null default true,

  auto_ad_disable_enabled boolean not null default true,
  auto_ad_disable_risk_threshold integer not null default 70,

  auto_ip_blocking_enabled boolean not null default false,
  auto_ip_blocking_risk_threshold integer not null default 90,

  ctr_alert_threshold_pct numeric not null default 0.5,

  ip_ranges_last_synced_at timestamptz,
  ip_ranges_count integer not null default 0,

  updated_at timestamptz not null default now(),

  constraint ad_protection_settings_singleton check (id),
  constraint ad_protection_click_freq_range check (click_frequency_max between 1 and 1000),
  constraint ad_protection_click_window_range check (click_frequency_window_seconds between 5 and 86400),
  constraint ad_protection_impression_freq_range check (impression_frequency_max between 1 and 5000),
  constraint ad_protection_impression_window_range check (impression_frequency_window_seconds between 5 and 86400),
  constraint ad_protection_disable_threshold_range check (auto_ad_disable_risk_threshold between 1 and 100),
  constraint ad_protection_block_threshold_range check (auto_ip_blocking_risk_threshold between 1 and 100),
  constraint ad_protection_ctr_threshold_range check (ctr_alert_threshold_pct >= 0 and ctr_alert_threshold_pct <= 100)
);

insert into public.ad_protection_settings (id) values (true) on conflict (id) do nothing;

alter table public.ad_protection_settings enable row level security;

drop policy if exists "Ad protection settings are publicly readable" on public.ad_protection_settings;
create policy "Ad protection settings are publicly readable"
  on public.ad_protection_settings for select
  using (true);

drop policy if exists "Admins can manage ad protection settings" on public.ad_protection_settings;
create policy "Admins can manage ad protection settings"
  on public.ad_protection_settings for all
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists ad_protection_settings_set_updated_at on public.ad_protection_settings;
create trigger ad_protection_settings_set_updated_at
  before update on public.ad_protection_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- ip_intel_ranges — known VPN/proxy and datacenter CIDR ranges, synced from
-- a free public list (Admin → Ad Protection → "Sync IP ranges"; see
-- POST /api/admin/ads/protection/sync-ip-ranges, source: X4BNet/lists_vpn).
-- Admin-only table — the public route never queries it directly, only
-- through check_ip_intel() below, so RLS never has to trust an anon read.
-- ---------------------------------------------------------------------------
create table if not exists public.ip_intel_ranges (
  id bigint generated always as identity primary key,
  category text not null check (category in ('vpn_or_proxy', 'datacenter')),
  range cidr not null,
  source text not null default 'x4bnet',
  created_at timestamptz not null default now()
);

create unique index if not exists ip_intel_ranges_unique_idx on public.ip_intel_ranges (category, range);
create index if not exists ip_intel_ranges_gist_idx on public.ip_intel_ranges using gist (range inet_ops);

alter table public.ip_intel_ranges enable row level security;

drop policy if exists "Admins can manage ip intel ranges" on public.ip_intel_ranges;
create policy "Admins can manage ip intel ranges"
  on public.ip_intel_ranges for all
  using (public.is_admin())
  with check (public.is_admin());

-- Callable by anon from the tracking route — returns two booleans rather
-- than exposing the range rows. Fails closed to "not vpn / not
-- datacenter" on a null or unparseable IP (e.g. IPv6 edge case, missing
-- header) rather than erroring the whole request out.
create or replace function public.check_ip_intel(p_ip text)
returns table(is_vpn boolean, is_datacenter boolean)
language plpgsql
security definer set search_path = public
stable
as $$
declare
  v_addr inet;
begin
  begin
    v_addr := p_ip::inet;
  exception when others then
    is_vpn := false;
    is_datacenter := false;
    return next;
    return;
  end;

  if v_addr is null then
    is_vpn := false;
    is_datacenter := false;
    return next;
    return;
  end if;

  select exists (
    select 1 from public.ip_intel_ranges where category = 'vpn_or_proxy' and v_addr <<= range
  ) into is_vpn;

  select exists (
    select 1 from public.ip_intel_ranges where category = 'datacenter' and v_addr <<= range
  ) into is_datacenter;

  return next;
end;
$$;

grant execute on function public.check_ip_intel(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- ad_protection_rules — Admin → Ad Protection → Whitelist / Blacklist. One
-- row per IP or visitor_id, either manually added by an admin or written
-- automatically by record_ad_event() below (auto_created = true) when Auto
-- IP Blocking fires. A whitelist entry always wins over any risk signal;
-- a blacklist entry always suppresses the ad slot regardless of score.
-- ---------------------------------------------------------------------------
create table if not exists public.ad_protection_rules (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('ip', 'visitor')),
  mode text not null check (mode in ('whitelist', 'blacklist')),
  value text not null check (char_length(btrim(value)) between 1 and 100),
  reason text,
  auto_created boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists ad_protection_rules_unique_idx on public.ad_protection_rules (target_type, value);

alter table public.ad_protection_rules enable row level security;

drop policy if exists "Admins can manage ad protection rules" on public.ad_protection_rules;
create policy "Admins can manage ad protection rules"
  on public.ad_protection_rules for all
  using (public.is_admin())
  with check (public.is_admin());

-- Callable by anon from the tracking route. Whitelist takes priority over
-- blacklist when (unusually) both an IP and a visitor_id match with
-- different modes.
create or replace function public.check_ad_rule(p_ip text, p_visitor_id text)
returns text
language sql
security definer set search_path = public
stable
as $$
  select case
    when exists (
      select 1 from public.ad_protection_rules
      where mode = 'whitelist'
        and ((target_type = 'ip' and value = p_ip) or (target_type = 'visitor' and value = p_visitor_id))
    ) then 'whitelist'
    when exists (
      select 1 from public.ad_protection_rules
      where mode = 'blacklist'
        and ((target_type = 'ip' and value = p_ip) or (target_type = 'visitor' and value = p_visitor_id))
    ) then 'blacklist'
    else null
  end;
$$;

grant execute on function public.check_ad_rule(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- ad_events — one row per impression or click on an ad slot. Insert-only
-- from the public site (nothing to leak from a write-only policy, same
-- pattern as page_views); reading it back is admin-only. Backs the
-- Traffic Quality Dashboard, CTR Monitoring, Click Heatmap (x_pct/y_pct),
-- and Invalid Traffic Reports.
-- ---------------------------------------------------------------------------
create table if not exists public.ad_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('impression', 'click')),
  placement text not null,
  path text not null,
  visitor_id text not null,
  user_id uuid references auth.users (id) on delete set null,
  ip text,
  country text,
  device_type text not null default 'desktop',
  browser text not null default 'Other',
  os text not null default 'Other',
  x_pct numeric,
  y_pct numeric,
  is_bot boolean not null default false,
  bot_reasons text[] not null default '{}',
  is_vpn boolean not null default false,
  is_datacenter boolean not null default false,
  rule_match text,
  risk_score integer not null default 0,
  blocked boolean not null default false,
  block_reason text,
  created_at timestamptz not null default now()
);

create index if not exists ad_events_created_at_idx on public.ad_events (created_at desc);
create index if not exists ad_events_visitor_id_idx on public.ad_events (visitor_id, created_at desc);
create index if not exists ad_events_placement_idx on public.ad_events (placement, created_at desc);
create index if not exists ad_events_ip_idx on public.ad_events (ip);
create index if not exists ad_events_flagged_idx on public.ad_events (created_at desc) where (blocked or is_bot or is_vpn or is_datacenter);

alter table public.ad_events enable row level security;

drop policy if exists "Admins can read ad events" on public.ad_events;
create policy "Admins can read ad events"
  on public.ad_events for select
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- ad_protection_actions — audit log of anything the system did on its own
-- (auto-disabling a placement for a session, auto-blacklisting an IP).
-- Admin-only read; the only writer is record_ad_event() (SECURITY
-- DEFINER), so there's deliberately no insert policy here at all.
-- ---------------------------------------------------------------------------
create table if not exists public.ad_protection_actions (
  id uuid primary key default gen_random_uuid(),
  action_type text not null check (action_type in ('auto_ip_block', 'auto_ad_disable')),
  target_type text not null check (target_type in ('ip', 'visitor')),
  target_value text not null,
  reason text,
  risk_score integer,
  created_at timestamptz not null default now()
);

create index if not exists ad_protection_actions_created_at_idx on public.ad_protection_actions (created_at desc);

alter table public.ad_protection_actions enable row level security;

drop policy if exists "Admins can read ad protection actions" on public.ad_protection_actions;
create policy "Admins can read ad protection actions"
  on public.ad_protection_actions for select
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- record_ad_event — the one write path for /api/ads/track. Scoring
-- (bot/VPN/datacenter signals, frequency-limit checks, the final risk
-- score and blocked decision) happens in the route handler, in
-- TypeScript, where it's far easier to read and tune; this function just
-- persists the result and — only when the caller says the risk crossed
-- the Auto IP Blocking threshold — writes the blacklist rule and audit
-- row in the same round trip. `on conflict do nothing` keeps a repeat
-- offender from generating duplicate rules or a flood of audit rows.
-- ---------------------------------------------------------------------------
create or replace function public.record_ad_event(
  p_event_type text,
  p_placement text,
  p_path text,
  p_visitor_id text,
  p_user_id uuid,
  p_ip text,
  p_country text,
  p_device_type text,
  p_browser text,
  p_os text,
  p_x_pct numeric,
  p_y_pct numeric,
  p_is_bot boolean,
  p_bot_reasons text[],
  p_is_vpn boolean,
  p_is_datacenter boolean,
  p_rule_match text,
  p_risk_score integer,
  p_blocked boolean,
  p_block_reason text,
  p_auto_block_ip boolean
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.ad_events (
    event_type, placement, path, visitor_id, user_id, ip, country,
    device_type, browser, os, x_pct, y_pct,
    is_bot, bot_reasons, is_vpn, is_datacenter, rule_match,
    risk_score, blocked, block_reason
  ) values (
    p_event_type, p_placement, p_path, p_visitor_id, p_user_id, p_ip, p_country,
    coalesce(p_device_type, 'desktop'), coalesce(p_browser, 'Other'), coalesce(p_os, 'Other'),
    p_x_pct, p_y_pct,
    coalesce(p_is_bot, false), coalesce(p_bot_reasons, '{}'), coalesce(p_is_vpn, false), coalesce(p_is_datacenter, false), p_rule_match,
    coalesce(p_risk_score, 0), coalesce(p_blocked, false), p_block_reason
  )
  returning id into v_id;

  if p_auto_block_ip and p_ip is not null and btrim(p_ip) <> '' then
    insert into public.ad_protection_rules (target_type, mode, value, reason, auto_created)
    values ('ip', 'blacklist', p_ip, coalesce(p_block_reason, 'Auto-blocked: risk score ' || coalesce(p_risk_score, 0)), true)
    on conflict (target_type, value) do nothing;

    insert into public.ad_protection_actions (action_type, target_type, target_value, reason, risk_score)
    values ('auto_ip_block', 'ip', p_ip, coalesce(p_block_reason, 'High risk score'), p_risk_score);
  elsif p_blocked then
    insert into public.ad_protection_actions (action_type, target_type, target_value, reason, risk_score)
    values ('auto_ad_disable', 'visitor', p_visitor_id, coalesce(p_block_reason, 'High risk score'), p_risk_score);
  end if;

  return v_id;
end;
$$;

grant execute on function public.record_ad_event(
  text, text, text, text, uuid, text, text, text, text, text,
  numeric, numeric, boolean, text[], boolean, boolean, text,
  integer, boolean, text, boolean
) to anon, authenticated;
