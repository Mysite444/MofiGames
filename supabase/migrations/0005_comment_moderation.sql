-- MofiGames — Phase 5: comment moderation for admins.
-- Run in Supabase Dashboard → SQL Editor, same as the others.
--
-- Migration 0004 only let a comment's own author delete it — there was no
-- way for an admin to remove someone else's comment (spam, abuse, etc.).
-- This adds that, reusing the same public.is_admin() helper the
-- games/categories policies already use (see 0003).

drop policy if exists "Admins can delete any comment" on public.comments;
create policy "Admins can delete any comment"
  on public.comments for delete
  using (public.is_admin());

-- Helps the admin moderation list (newest comments across every game,
-- optionally filtered by game) sort efficiently.
create index if not exists comments_created_at_idx on public.comments (created_at desc);
