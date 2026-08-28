-- MofiGames — Phase 7: Content Management (Tags, Pages, Blog/News posts).
-- Run in Supabase SQL Editor. Safe to run multiple times.

-- ---------------------------------------------------------------------------
-- tags — reusable labels attached to blog/news posts.
-- ---------------------------------------------------------------------------
create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  color text not null default '#ffd60a',
  created_at timestamptz not null default now()
);

alter table public.tags enable row level security;

drop policy if exists "Tags are publicly readable" on public.tags;
create policy "Tags are publicly readable"
  on public.tags for select
  using (true);

drop policy if exists "Admins can manage tags" on public.tags;
create policy "Admins can manage tags"
  on public.tags for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- pages — custom static pages (FAQ, Careers, Press, etc.) managed entirely
-- through the admin panel. Content is HTML produced by the admin panel's
-- rich text editor.
-- ---------------------------------------------------------------------------
create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  content text not null default '',
  meta_description text not null default '',
  show_in_nav boolean not null default true,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pages enable row level security;

drop policy if exists "Published pages are publicly readable" on public.pages;
create policy "Published pages are publicly readable"
  on public.pages for select
  using (is_published = true or public.is_admin());

drop policy if exists "Admins can manage pages" on public.pages;
create policy "Admins can manage pages"
  on public.pages for all
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists pages_set_updated_at on public.pages;
create trigger pages_set_updated_at
  before update on public.pages
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- posts — blog/news posts. Content is HTML produced by the admin panel's
-- rich text editor, same as pages.
-- ---------------------------------------------------------------------------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  excerpt text not null default '',
  content text not null default '',
  cover_image_url text,
  author_name text not null default 'MofiGames Team',
  is_published boolean not null default true,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists posts_published_idx on public.posts (is_published, published_at desc);

alter table public.posts enable row level security;

drop policy if exists "Published posts are publicly readable" on public.posts;
create policy "Published posts are publicly readable"
  on public.posts for select
  using (is_published = true or public.is_admin());

drop policy if exists "Admins can manage posts" on public.posts;
create policy "Admins can manage posts"
  on public.posts for all
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists posts_set_updated_at on public.posts;
create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- post_tags — many-to-many between posts and tags.
-- ---------------------------------------------------------------------------
create table if not exists public.post_tags (
  post_id uuid not null references public.posts (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (post_id, tag_id)
);

alter table public.post_tags enable row level security;

drop policy if exists "Post tags are publicly readable" on public.post_tags;
create policy "Post tags are publicly readable"
  on public.post_tags for select
  using (true);

drop policy if exists "Admins can manage post tags" on public.post_tags;
create policy "Admins can manage post tags"
  on public.post_tags for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage: blog post cover images. Public-read, admin-write, same pattern
-- as game-thumbnails/game-files in migration 0003.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('content-images', 'content-images', true)
on conflict (id) do nothing;

drop policy if exists "Public read content-images" on storage.objects;
create policy "Public read content-images"
  on storage.objects for select
  using (bucket_id = 'content-images');

drop policy if exists "Admins can write content-images" on storage.objects;
create policy "Admins can write content-images"
  on storage.objects for insert
  with check (bucket_id = 'content-images' and public.is_admin());

drop policy if exists "Admins can update content-images" on storage.objects;
create policy "Admins can update content-images"
  on storage.objects for update
  using (bucket_id = 'content-images' and public.is_admin());

drop policy if exists "Admins can delete content-images" on storage.objects;
create policy "Admins can delete content-images"
  on storage.objects for delete
  using (bucket_id = 'content-images' and public.is_admin());
