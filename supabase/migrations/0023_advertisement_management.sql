-- MofiGames — Phase 23: Advertisement Management.
-- Adds a dedicated "Advertisement Management" settings singleton (Admin →
-- Monetization → Advertisement Management) covering every ad placement the
-- public site can render: Google AdSense, Header, Sidebar, In-Game,
-- Footer, Sticky, Reward, and freeform Custom HTML ads. Same singleton
-- shape as `site_identity` / `seo_settings` — one row, publicly readable
-- (the site needs to read it to render ads), admin-only to write.
-- Run in Supabase SQL Editor. Safe to run multiple times.

create table if not exists public.ad_settings (
  id boolean primary key default true,

  -- Google AdSense (account-level auto ads + the client id used by every
  -- ad unit below when a placement doesn't have its own custom code).
  adsense_enabled boolean not null default false,
  adsense_client_id text,
  adsense_auto_ads boolean not null default false,

  -- Header ad — banner shown under/beside the site header.
  header_ads_enabled boolean not null default false,
  header_ads_slot_id text,
  header_ads_code text,

  -- Sidebar ad — shown in the sidebar/rail on desktop layouts.
  sidebar_ads_enabled boolean not null default false,
  sidebar_ads_slot_id text,
  sidebar_ads_code text,

  -- In-game ad — interstitial shown around gameplay (e.g. before load,
  -- or every N plays).
  ingame_ads_enabled boolean not null default false,
  ingame_ads_slot_id text,
  ingame_ads_code text,
  ingame_ads_frequency integer not null default 3,

  -- Footer ad — banner shown at the bottom of the page.
  footer_ads_enabled boolean not null default false,
  footer_ads_slot_id text,
  footer_ads_code text,

  -- Sticky ad — anchored banner that stays fixed on screen while scrolling.
  sticky_ads_enabled boolean not null default false,
  sticky_ads_slot_id text,
  sticky_ads_code text,
  sticky_ads_position text not null default 'bottom',
  sticky_ads_dismissible boolean not null default true,

  -- Reward ad — opt-in rewarded video (e.g. "watch an ad" for a perk).
  reward_ads_enabled boolean not null default false,
  reward_ads_slot_id text,
  reward_ads_code text,
  reward_ads_reward_label text not null default 'Bonus unlocked',

  -- Custom HTML ad — freeform script/markup slot for any other network,
  -- rendered wherever the site chooses to mount the "custom" placement.
  custom_html_ads_enabled boolean not null default false,
  custom_html_ads_code text,

  updated_at timestamptz not null default now(),
  constraint ad_settings_singleton check (id),
  constraint ad_settings_sticky_position check (sticky_ads_position in ('top', 'bottom')),
  constraint ad_settings_ingame_frequency check (ingame_ads_frequency between 1 and 100)
);

insert into public.ad_settings (id) values (true) on conflict (id) do nothing;

alter table public.ad_settings enable row level security;

drop policy if exists "Ad settings are publicly readable" on public.ad_settings;
create policy "Ad settings are publicly readable"
  on public.ad_settings for select
  using (true);

drop policy if exists "Admins can manage ad settings" on public.ad_settings;
create policy "Admins can manage ad settings"
  on public.ad_settings for all
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists ad_settings_set_updated_at on public.ad_settings;
create trigger ad_settings_set_updated_at
  before update on public.ad_settings
  for each row execute function public.set_updated_at();
