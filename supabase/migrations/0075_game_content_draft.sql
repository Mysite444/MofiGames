-- MofiGames — Game content draft column.
--
-- Adds proper draft/published separation for game long-form content.
-- Until now editing a published game's content immediately changed
-- the live page. With content_draft, edits accumulate as a draft and
-- only go live when the admin explicitly clicks "Publish"/"Update".
--
-- Workflow:
--   1. Admin opens full-page editor.
--   2. Autosave writes to content_draft (never touching live content).
--   3. "Publish" / "Update" copies content_draft → content (and sets
--      is_published = true if the game was a draft).
--   4. "Save Draft" saves all fields with is_published = false; also
--      writes the editor content to content_draft.
--   5. Public game page always renders `content` — the last intentionally
--      published version. The draft is never exposed publicly.
--
-- content_draft IS NULL  →  no pending edits; editor initialises from content.
-- content_draft = ''     →  admin explicitly cleared the content (rare).
-- content_draft = <html> →  pending edits ready to publish.
--
-- Backward compatible: existing rows get content_draft = null.

alter table public.games
  add column if not exists content_draft text;

comment on column public.games.content_draft is
  'Work-in-progress draft of the long-form content section (sanitized HTML). '
  'NULL means no pending edits — editor falls back to `content`. '
  'Publishing copies this to `content`.';

-- No new RLS policies needed: content_draft is covered by the existing
-- "publicly readable if published" + "admins can manage" policies from
-- migration 0003.
