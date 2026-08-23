-- MofiGames — Phase 15: Reports & Moderation.
-- Extends Admin → User Reports into a full case-management system backing
-- Admin → Reports & Moderation: User Reports, Report Categories, Report
-- Queue, Report History, Copyright Requests, DMCA Requests, Counter-
-- Notices, Copyright Claim History, Abuse/Spam/Harassment/Impersonation/
-- Inappropriate-Content Reports, and Administration (status, assignment,
-- moderator notes, actions taken, audit log).
-- Run in Supabase SQL Editor. Safe to run multiple times.

-- ---------------------------------------------------------------------------
-- Design note: this does NOT introduce a second reports table. The existing
-- `user_reports` table (migration 0012) already models "someone reporting
-- something for review" — Abuse Reports/Spam/Harassment/Impersonation/
-- Inappropriate Content are simply that table filtered by `reason`, and
-- User Reports is that table filtered by `kind = 'user'`. This migration
-- widens it to also carry copyright/DMCA/counter-notice cases (`kind`
-- column) and adds the case-management columns (assignment, priority,
-- category) plus three satellite tables (notes, actions, audit log) that
-- every report — regardless of kind — shares.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- report_categories — Admin → Reports → Report Categories. Seeded to match
-- the existing `reason` values (group = 'abuse') plus the new copyright
-- kinds (group = 'copyright'). Purely descriptive/organizational — `key` is
-- referenced by user_reports.category_key but nothing enforces every report
-- have one, so existing rows keep working untouched.
-- ---------------------------------------------------------------------------
create table if not exists public.report_categories (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  "group" text not null check ("group" in ('user', 'copyright', 'abuse')),
  description text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.report_categories enable row level security;

drop policy if exists "Staff can view report categories" on public.report_categories;
create policy "Staff can view report categories"
  on public.report_categories for select
  using (public.is_admin() or public.has_permission('manage_reports') or public.has_permission('manage_copyright'));

drop policy if exists "Admins can manage report categories" on public.report_categories;
create policy "Admins can manage report categories"
  on public.report_categories for all
  using (public.is_admin())
  with check (public.is_admin());

insert into public.report_categories (key, label, "group", description, sort_order) values
  ('spam', 'Spam', 'abuse', 'Unsolicited advertising, scams, or repeated junk content.', 1),
  ('harassment', 'Harassment / Hate Speech', 'abuse', 'Targeted harassment, threats, or hateful conduct.', 2),
  ('inappropriate_content', 'Inappropriate Content', 'abuse', 'Content unsuitable for the platform (sexual, violent, etc.).', 3),
  ('impersonation', 'Impersonation', 'abuse', 'Pretending to be another person, brand, or staff member.', 4),
  ('other', 'Other', 'abuse', 'Anything that doesn''t fit the categories above.', 5),
  ('copyright', 'General Copyright Claim', 'copyright', 'A copyright concern that isn''t a formal DMCA takedown.', 10),
  ('dmca', 'DMCA Takedown', 'copyright', 'A formal DMCA takedown notice under 17 U.S.C. §512.', 11),
  ('counter_notice', 'DMCA Counter-Notice', 'copyright', 'A response disputing a prior DMCA takedown.', 12)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Permission. `manage_reports` (0012) keeps covering User Reports and every
-- Abuse & Moderation view (they're the same table/kind). Copyright is
-- gated separately so a moderator can be trusted with one and not the
-- other — mirrors the existing 5-permission catalog in src/lib/permissions.ts,
-- which is updated by hand alongside this constraint.
-- ---------------------------------------------------------------------------
alter table public.role_permissions drop constraint if exists role_permissions_permission_check;
alter table public.role_permissions add constraint role_permissions_permission_check
  check (permission in (
    'ban_users', 'verify_users', 'manage_reports', 'view_activity_logs', 'moderate_comments', 'manage_copyright'
  ));

alter table public.user_permission_overrides drop constraint if exists user_permission_overrides_permission_check;
alter table public.user_permission_overrides add constraint user_permission_overrides_permission_check
  check (permission in (
    'ban_users', 'verify_users', 'manage_reports', 'view_activity_logs', 'moderate_comments', 'manage_copyright'
  ));

-- ---------------------------------------------------------------------------
-- user_reports — widened. `kind` distinguishes what's being filed;
-- `reported_user_id` is relaxed to nullable since a copyright claim
-- targets content, not necessarily a known account. Case-management
-- columns (assignment/priority/category) apply to every kind alike.
-- ---------------------------------------------------------------------------
alter table public.user_reports alter column reported_user_id drop not null;

alter table public.user_reports add column if not exists kind text not null default 'user'
  check (kind in ('user', 'copyright', 'dmca', 'counter_notice'));

alter table public.user_reports drop constraint if exists user_reports_reason_check;
alter table public.user_reports add constraint user_reports_reason_check check (
  (kind = 'user' and reason in ('spam', 'harassment', 'inappropriate_content', 'impersonation', 'other'))
  or (kind <> 'user' and reason is null)
);
alter table public.user_reports alter column reason drop not null;

alter table public.user_reports add column if not exists category_key text references public.report_categories (key) on delete set null;
alter table public.user_reports add column if not exists assigned_moderator_id uuid references auth.users (id) on delete set null;
alter table public.user_reports add column if not exists priority text not null default 'normal'
  check (priority in ('low', 'normal', 'high', 'urgent'));
alter table public.user_reports add column if not exists updated_at timestamptz not null default now();

-- Copyright/DMCA-specific fields. Left null for kind = 'user'.
alter table public.user_reports add column if not exists claimant_name text;
alter table public.user_reports add column if not exists claimant_email text;
alter table public.user_reports add column if not exists copyrighted_work_description text;
alter table public.user_reports add column if not exists infringing_url text;
alter table public.user_reports add column if not exists sworn_statement boolean not null default false;
alter table public.user_reports add column if not exists related_report_id uuid references public.user_reports (id) on delete set null;

-- Admin's requested status vocabulary is Open / Under Review / Resolved /
-- Rejected. The existing enum (pending/reviewed/resolved/dismissed, 0012)
-- means exactly that — renaming the stored values would ripple through
-- every policy/route/component above for no behavioral change, so the
-- mapping is applied at the UI layer instead (see admin-content.ts).

create index if not exists user_reports_kind_status_created_at_idx on public.user_reports (kind, status, created_at desc);
create index if not exists user_reports_category_key_idx on public.user_reports (category_key);
create index if not exists user_reports_assigned_moderator_id_idx on public.user_reports (assigned_moderator_id);

drop trigger if exists user_reports_set_updated_at on public.user_reports;
create or replace function public.user_reports_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger user_reports_set_updated_at
  before update on public.user_reports
  for each row execute function public.user_reports_set_updated_at();

-- Copyright/DMCA/counter-notice claims can be filed by non-account holders
-- (rights holders, accused users responding to a claim) — insert is open
-- to any request (incl. anonymous) for those kinds specifically, and the
-- app-level route still validates required claimant fields.
drop policy if exists "Anyone can file a copyright claim" on public.user_reports;
create policy "Anyone can file a copyright claim"
  on public.user_reports for insert
  with check (kind in ('copyright', 'dmca', 'counter_notice'));

-- Staff can view/update user-kind and copyright-kind reports under
-- separate permissions; is_admin always passes both.
drop policy if exists "Staff can view reports" on public.user_reports;
create policy "Staff can view reports"
  on public.user_reports for select
  using (
    public.is_admin()
    or (kind = 'user' and public.has_permission('manage_reports'))
    or (kind <> 'user' and (public.has_permission('manage_copyright') or public.has_permission('manage_reports')))
  );

drop policy if exists "Staff can update reports" on public.user_reports;
create policy "Staff can update reports"
  on public.user_reports for update
  using (
    public.is_admin()
    or (kind = 'user' and public.has_permission('manage_reports'))
    or (kind <> 'user' and (public.has_permission('manage_copyright') or public.has_permission('manage_reports')))
  )
  with check (
    public.is_admin()
    or (kind = 'user' and public.has_permission('manage_reports'))
    or (kind <> 'user' and (public.has_permission('manage_copyright') or public.has_permission('manage_reports')))
  );

-- ---------------------------------------------------------------------------
-- report_notes — Administration → Moderator Notes. Internal-only, never
-- shown to the reporter/reported party.
-- ---------------------------------------------------------------------------
create table if not exists public.report_notes (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.user_reports (id) on delete cascade,
  moderator_id uuid references auth.users (id) on delete set null,
  note text not null check (char_length(note) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists report_notes_report_id_idx on public.report_notes (report_id, created_at desc);

alter table public.report_notes enable row level security;

drop policy if exists "Staff can view report notes" on public.report_notes;
create policy "Staff can view report notes"
  on public.report_notes for select
  using (public.is_admin() or public.has_permission('manage_reports') or public.has_permission('manage_copyright'));

drop policy if exists "Staff can add report notes" on public.report_notes;
create policy "Staff can add report notes"
  on public.report_notes for insert
  with check (
    (public.is_admin() or public.has_permission('manage_reports') or public.has_permission('manage_copyright'))
    and moderator_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- report_actions — Administration → Actions Taken. A record of what staff
-- actually did about a case (warning issued, content removed, user
-- suspended/banned). Recording a suspend/ban action here is a log entry
-- only — the API route additionally calls the same profile-update path
-- Banned Users uses so the action has a real effect, gated by its own
-- ban_users permission check independent of manage_reports/manage_copyright.
-- ---------------------------------------------------------------------------
create table if not exists public.report_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.user_reports (id) on delete cascade,
  action_type text not null check (action_type in ('warning', 'remove_content', 'suspend_user', 'ban_user')),
  target_user_id uuid references auth.users (id) on delete set null,
  moderator_id uuid references auth.users (id) on delete set null,
  details text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists report_actions_report_id_idx on public.report_actions (report_id, created_at desc);

alter table public.report_actions enable row level security;

drop policy if exists "Staff can view report actions" on public.report_actions;
create policy "Staff can view report actions"
  on public.report_actions for select
  using (public.is_admin() or public.has_permission('manage_reports') or public.has_permission('manage_copyright'));

drop policy if exists "Staff can record report actions" on public.report_actions;
create policy "Staff can record report actions"
  on public.report_actions for insert
  with check (
    (public.is_admin() or public.has_permission('manage_reports') or public.has_permission('manage_copyright'))
    and moderator_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- report_audit_log — Administration → Audit Log. Append-only trail of
-- every status change, assignment change, note, and action across every
-- report, plus category management changes. Written at the app layer
-- (route handlers), same pattern as user_activity_logs (0012) rather than
-- database triggers, so entries can carry a human-readable summary.
-- ---------------------------------------------------------------------------
create table if not exists public.report_audit_log (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.user_reports (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists report_audit_log_report_id_idx on public.report_audit_log (report_id, created_at desc);
create index if not exists report_audit_log_created_at_idx on public.report_audit_log (created_at desc);

alter table public.report_audit_log enable row level security;

drop policy if exists "Staff can view report audit log" on public.report_audit_log;
create policy "Staff can view report audit log"
  on public.report_audit_log for select
  using (public.is_admin() or public.has_permission('manage_reports') or public.has_permission('manage_copyright'));

drop policy if exists "Staff can write report audit log" on public.report_audit_log;
create policy "Staff can write report audit log"
  on public.report_audit_log for insert
  with check (
    (public.is_admin() or public.has_permission('manage_reports') or public.has_permission('manage_copyright'))
    and actor_id = auth.uid()
  );
