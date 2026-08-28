-- MofiGames — Phase 22: Site Identity & Custom Menu Links.
-- Adds a dedicated "Site Identity" settings singleton (Site Name, Site
-- Tagline, Logo, Favicon) as its own Admin section, separate from the
-- deeper Global SEO Settings — plus a `menu_links` table so custom
-- navigation links can be added/edited/removed from
-- Admin → Site Settings → Menu Links instead of being hardcoded.
-- Run in Supabase SQL Editor. Safe to run multiple times.

-- ---------------------------------------------------------------------------
-- site_identity — singleton row (Admin → Site Settings → Site Identity).
-- Read on every page (header logo/name, <title> fallback, favicon), so it's
-- publicly readable; only admins can write it. Same shape as seo_settings.
-- ---------------------------------------------------------------------------
create table if not exists public.site_identity (
  id boolean primary key default true,
  site_name text not null default 'MofiGames',
  site_tagline text not null default 'Hundreds of free browser games — no download, just play.',
  logo_url text,
  favicon_url text,
  updated_at timestamptz not null default now(),
  constraint site_identity_singleton check (id)
);

insert into public.site_identity (id) values (true) on conflict (id) do nothing;

alter table public.site_identity enable row level security;

drop policy if exists "Site identity is publicly readable" on public.site_identity;
create policy "Site identity is publicly readable"
  on public.site_identity for select
  using (true);

drop policy if exists "Admins can manage site identity" on public.site_identity;
create policy "Admins can manage site identity"
  on public.site_identity for all
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists site_identity_set_updated_at on public.site_identity;
create trigger site_identity_set_updated_at
  before update on public.site_identity
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- menu_links — custom nav links an admin can add/edit/remove/reorder from
-- Admin → Site Settings → Menu Links. Rendered in the "Custom Links"
-- section of the sidebar/drawer menu (see NavList.tsx), alongside the
-- existing Discover/Genres/Pages sections.
-- ---------------------------------------------------------------------------
create table if not exists public.menu_links (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  url text not null,
  open_in_new_tab boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists menu_links_sort_idx on public.menu_links (sort_order, created_at);

alter table public.menu_links enable row level security;

-- Public read is filtered to active links in the app query itself
-- (see src/lib/menu-links.ts); the policy stays permissive like `pages`
-- so the admin list (which needs inactive rows too) can reuse it.
drop policy if exists "Menu links are publicly readable" on public.menu_links;
create policy "Menu links are publicly readable"
  on public.menu_links for select
  using (true);

drop policy if exists "Admins can manage menu links" on public.menu_links;
create policy "Admins can manage menu links"
  on public.menu_links for all
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists menu_links_set_updated_at on public.menu_links;
create trigger menu_links_set_updated_at
  before update on public.menu_links
  for each row execute function public.set_updated_at();
