-- MofiGames — Phase 14: Localization Module.
-- Implements Admin → Localization: Languages, Translations, Currency,
-- Region Settings, and Advanced (auto-detection) settings.
-- Run in Supabase SQL Editor. Safe to run multiple times.

-- ---------------------------------------------------------------------------
-- languages — Supported Languages / Default Language / Enable-Disable /
-- RTL-LTR. `code` is the ISO 639-1 (optionally with region, e.g. "pt-BR")
-- locale code and doubles as the primary key everywhere else references a
-- language (translations.language_code).
-- ---------------------------------------------------------------------------
create table if not exists public.languages (
  code text primary key,
  name text not null,
  native_name text not null default '',
  flag_emoji text not null default '',
  is_rtl boolean not null default false,
  is_default boolean not null default false,
  is_enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.languages enable row level security;

drop policy if exists "Languages are publicly readable" on public.languages;
create policy "Languages are publicly readable"
  on public.languages for select
  using (true);

drop policy if exists "Admins can manage languages" on public.languages;
create policy "Admins can manage languages"
  on public.languages for all
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists languages_set_updated_at on public.languages;
create trigger languages_set_updated_at
  before update on public.languages
  for each row execute function public.set_updated_at();

-- Exactly one default language at a time — setting a new one automatically
-- clears the previous default, same as a radio button.
create or replace function public.enforce_single_default_language()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_default then
    update public.languages set is_default = false where code <> new.code and is_default;
  end if;
  return new;
end;
$$;

drop trigger if exists languages_single_default on public.languages;
create trigger languages_single_default
  after insert or update of is_default on public.languages
  for each row when (new.is_default)
  execute function public.enforce_single_default_language();

insert into public.languages (code, name, native_name, flag_emoji, is_rtl, is_default, is_enabled, sort_order)
values ('en', 'English', 'English', '🇺🇸', false, true, true, 0)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- currencies — Default Currency / Supported Currencies / Symbol / Position /
-- Separators / Exchange Rates. `code` is the ISO 4217 code (e.g. "USD").
-- ---------------------------------------------------------------------------
create table if not exists public.currencies (
  code text primary key,
  name text not null,
  symbol text not null,
  symbol_position text not null default 'before',
  decimal_separator text not null default '.',
  thousands_separator text not null default ',',
  decimal_places smallint not null default 2,
  exchange_rate numeric(18, 6) not null default 1,
  exchange_rate_mode text not null default 'manual',
  is_default boolean not null default false,
  is_enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.currencies drop constraint if exists currencies_symbol_position_check;
alter table public.currencies add constraint currencies_symbol_position_check
  check (symbol_position in ('before', 'after'));

alter table public.currencies drop constraint if exists currencies_exchange_rate_mode_check;
alter table public.currencies add constraint currencies_exchange_rate_mode_check
  check (exchange_rate_mode in ('automatic', 'manual'));

alter table public.currencies enable row level security;

drop policy if exists "Currencies are publicly readable" on public.currencies;
create policy "Currencies are publicly readable"
  on public.currencies for select
  using (true);

drop policy if exists "Admins can manage currencies" on public.currencies;
create policy "Admins can manage currencies"
  on public.currencies for all
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists currencies_set_updated_at on public.currencies;
create trigger currencies_set_updated_at
  before update on public.currencies
  for each row execute function public.set_updated_at();

create or replace function public.enforce_single_default_currency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_default then
    update public.currencies set is_default = false where code <> new.code and is_default;
  end if;
  return new;
end;
$$;

drop trigger if exists currencies_single_default on public.currencies;
create trigger currencies_single_default
  after insert or update of is_default on public.currencies
  for each row when (new.is_default)
  execute function public.enforce_single_default_currency();

insert into public.currencies (code, name, symbol, symbol_position, decimal_separator, thousands_separator, decimal_places, exchange_rate, exchange_rate_mode, is_default, is_enabled, sort_order)
values ('USD', 'US Dollar', '$', 'before', '.', ',', 2, 1, 'manual', true, true, 0)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- translations — UI / Menu / Page / Email Template / Error Message
-- translations, keyed by namespace + key + language. Backs the Missing
-- Translation Report (any enabled language missing a key that exists for
-- the default language).
-- ---------------------------------------------------------------------------
create table if not exists public.translations (
  id uuid primary key default gen_random_uuid(),
  namespace text not null,
  key text not null,
  language_code text not null references public.languages (code) on delete cascade,
  value text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (namespace, key, language_code)
);

alter table public.translations drop constraint if exists translations_namespace_check;
alter table public.translations add constraint translations_namespace_check
  check (namespace in ('ui', 'menu', 'page', 'email', 'error'));

create index if not exists translations_namespace_language_idx
  on public.translations (namespace, language_code);
create index if not exists translations_key_idx on public.translations (key);

alter table public.translations enable row level security;

drop policy if exists "Translations are publicly readable" on public.translations;
create policy "Translations are publicly readable"
  on public.translations for select
  using (true);

drop policy if exists "Admins can manage translations" on public.translations;
create policy "Admins can manage translations"
  on public.translations for all
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists translations_set_updated_at on public.translations;
create trigger translations_set_updated_at
  before update on public.translations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- localization_settings — a single global settings row (singleton, same
-- pattern as seo_settings). Backs Region Settings and Advanced. The three
-- "list" style optional features (Currency by Region, Regional Content
-- Restrictions, Country-Based Redirects) live here as jsonb arrays/objects
-- rather than their own tables — each row is small and always edited as a
-- whole list from one admin screen, so a table per list would just add
-- round trips without adding real query needs.
-- ---------------------------------------------------------------------------
create table if not exists public.localization_settings (
  id boolean primary key default true,

  -- Region Settings
  default_country text not null default 'US',
  default_region text not null default '',
  timezone text not null default 'UTC',
  date_format text not null default 'MM/DD/YYYY',
  time_format text not null default '12h',
  number_format text not null default '1,234.56',
  first_day_of_week text not null default 'sunday',
  measurement_units text not null default 'imperial',

  -- Language Switcher
  language_switcher_style text not null default 'dropdown',
  language_switcher_enabled boolean not null default true,

  -- Advanced
  auto_language_detection boolean not null default true,
  auto_currency_detection boolean not null default true,
  geo_ip_region_detection boolean not null default false,

  -- Optional region features, stored as small lists
  currency_by_region jsonb not null default '[]'::jsonb,
  regional_content_restrictions jsonb not null default '[]'::jsonb,
  country_redirects jsonb not null default '[]'::jsonb,
  regional_content_restrictions_enabled boolean not null default false,
  country_redirects_enabled boolean not null default false,

  updated_at timestamptz not null default now(),

  constraint localization_settings_singleton check (id)
);

alter table public.localization_settings drop constraint if exists localization_settings_time_format_check;
alter table public.localization_settings add constraint localization_settings_time_format_check
  check (time_format in ('12h', '24h'));

alter table public.localization_settings drop constraint if exists localization_settings_first_day_check;
alter table public.localization_settings add constraint localization_settings_first_day_check
  check (first_day_of_week in ('sunday', 'monday', 'saturday'));

alter table public.localization_settings drop constraint if exists localization_settings_units_check;
alter table public.localization_settings add constraint localization_settings_units_check
  check (measurement_units in ('metric', 'imperial'));

alter table public.localization_settings drop constraint if exists localization_settings_switcher_style_check;
alter table public.localization_settings add constraint localization_settings_switcher_style_check
  check (language_switcher_style in ('dropdown', 'flags', 'list'));

insert into public.localization_settings (id) values (true) on conflict (id) do nothing;

alter table public.localization_settings enable row level security;

drop policy if exists "Localization settings are publicly readable" on public.localization_settings;
create policy "Localization settings are publicly readable"
  on public.localization_settings for select
  using (true);

drop policy if exists "Admins can manage localization settings" on public.localization_settings;
create policy "Admins can manage localization settings"
  on public.localization_settings for all
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists localization_settings_set_updated_at on public.localization_settings;
create trigger localization_settings_set_updated_at
  before update on public.localization_settings
  for each row execute function public.set_updated_at();
