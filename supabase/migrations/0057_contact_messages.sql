-- MofiGames — Phase 57: Contact form messages.
--
-- Stores messages submitted through /contact.  Insertions go through
-- /api/contact which validates, rate-limits, and sanitizes before writing.
-- RLS: anon cannot read any rows (only staff can via the admin UI or SQL);
-- anon cannot insert directly — the route handler uses the service-role
-- key for the actual write, so no INSERT policy is needed on anon.
-- Run in Supabase SQL Editor.  Safe to run multiple times.

create table if not exists public.contact_messages (
  id          bigint generated always as identity primary key,
  name        text not null check (char_length(name) between 1 and 120),
  email       text not null check (char_length(email) between 5 and 255),
  subject     text not null check (char_length(subject) between 1 and 200),
  message     text not null check (char_length(message) between 10 and 5000),
  ip          text,
  user_agent  text,
  user_id     uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  read_at     timestamptz,
  archived_at timestamptz
);

alter table public.contact_messages enable row level security;

-- Only staff (admin / editor / moderator) may read contact messages.
create policy "staff can read contact messages"
  on public.contact_messages
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.is_admin = true or p.role in ('editor', 'moderator'))
    )
  );

-- No public insert policy — the API route uses the service-role key to
-- bypass RLS after server-side validation and rate limiting.

-- Useful indexes for the admin list view (newest-first, unread filter).
create index if not exists contact_messages_created_at_idx
  on public.contact_messages (created_at desc);

create index if not exists contact_messages_read_at_idx
  on public.contact_messages (read_at)
  where read_at is null;
