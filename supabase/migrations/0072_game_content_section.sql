-- MofiGames — Game post "arranged content" section.
--
-- Until now, the long-form article body admins wrote for a game (how to
-- play, tips, features, FAQ…) had nowhere to go but the `description`
-- textarea — a single plain-text field with no headings/paragraphs/lists,
-- which is why game pages rendered it as one unbroken wall of text while
-- the same kind of copy on category pages (via `content` jsonb on
-- `categories`) rendered as properly arranged sections.
--
-- `games.content` stores sanitized HTML from the admin panel's
-- RichTextEditor (the same editor already used for Pages/Blog — see
-- RichTextEditor.tsx / RichContent.tsx) so the game page can render real
-- <h2>/<h3>/<p>/<ul>/<ol> structure instead of a flat string. `description`
-- keeps its existing job (short intro blurb + SEO meta-description
-- fallback in lib/seo.ts) — kept deliberately separate so this new field
-- is never accidentally dumped, HTML tags and all, into a <meta> tag.
--
-- Safe to run multiple times (if not exists).

alter table public.games
  add column if not exists content text not null default '';

comment on column public.games.content is
  'Long-form arranged content section (sanitized HTML from RichTextEditor) — headings, paragraphs, bullet/numbered lists shown below the game info on both desktop and mobile. Distinct from `description` (short blurb / SEO fallback).';

-- Rollback:
--   alter table public.games drop column if exists content;
