-- MofiGames — Phase 77: admin approval gate for comments.
--
-- New comments land in a pending state (is_approved = false) and only
-- become publicly visible once an admin approves them in
-- Admin → Content → Comments.  Existing comments are bulk-approved so
-- no live content disappears after the migration runs.

-- 1. Add the approval column ------------------------------------------------
alter table public.comments
  add column if not exists is_approved boolean not null default false;

-- 2. Approve all previously-existing comments so the site doesn't break -----
update public.comments
  set is_approved = true
  where is_approved = false;

-- 3. Replace the blanket public-readable policy with an approved-only one ---
drop policy if exists "Comments are publicly readable" on public.comments;
create policy "Comments are publicly readable"
  on public.comments for select
  using (is_approved = true);

-- 4. Admins can see every comment (including the pending queue) --------------
drop policy if exists "Admins can read all comments" on public.comments;
create policy "Admins can read all comments"
  on public.comments for select
  using (public.is_admin());

-- 5. Admins can approve (and re-pend) comments via UPDATE -------------------
--    Intentionally broad — the route handler enforces that only is_approved
--    is ever patched (it builds the update payload itself).
drop policy if exists "Admins can approve comments" on public.comments;
create policy "Admins can approve comments"
  on public.comments for update
  using (public.is_admin())
  with check (public.is_admin());

-- 6. Index for the admin pending queue (newest unapproved first) ------------
create index if not exists comments_approval_created_at_idx
  on public.comments (is_approved, created_at desc);
