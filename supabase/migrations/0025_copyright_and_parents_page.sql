-- MofiGames — Phase 25: Editable footer copyright + admin-editable Parents
-- Info page.
-- Run in Supabase SQL Editor. Safe to run multiple times.

-- ---------------------------------------------------------------------------
-- site_identity.copyright_text — Admin → Site Settings → Site Identity.
-- Rendered in the footer as "© {current year} {copyright_text}" (see
-- NavList.tsx / app/page.tsx). Kept separate from site_name so the year
-- always stays current without an admin having to edit it every January.
-- ---------------------------------------------------------------------------
alter table public.site_identity
  add column if not exists copyright_text text not null default 'MofiGames. All rights reserved.';

-- ---------------------------------------------------------------------------
-- Parents Info page — previously hardcoded at src/app/parents-info/page.tsx.
-- Seeded into `pages` (Admin → Content Management → Pages) so its copy can
-- be edited without a code change. `show_in_nav` is false because the
-- sidebar/drawer link to /parents-info is already hardcoded in NavList.tsx
-- (it's a permanent nav item, not a discoverable custom page) — turning
-- this on would just duplicate that entry.
-- ---------------------------------------------------------------------------
insert into public.pages (slug, title, content, meta_description, show_in_nav, sort_order, is_published)
values (
  'parents-info',
  'Parents Info',
  '<p>Thanks for taking a moment to learn about the site your child is using. Here''s a quick overview.</p>' ||
  '<h2>What this site is</h2>' ||
  '<p>MofiGames is a browser-based games portal organized into categories like action, puzzle, sports, and strategy. Games run directly in the browser — no downloads or installs.</p>' ||
  '<h2>Accounts and personal data</h2>' ||
  '<p>This build doesn''t collect accounts or personal information. If that changes in the future, our Privacy Policy will be updated to reflect exactly what''s collected and why.</p>' ||
  '<h2>Chat and multiplayer</h2>' ||
  '<p>Some games are categorized as Multiplayer. If any embedded game includes chat or voice features, that functionality is controlled by the game''s own provider, not by MofiGames — we''d recommend reviewing those features directly.</p>' ||
  '<h2>Recommended settings</h2>' ||
  '<p>Consider using your device or browser''s built-in parental controls and screen-time tools alongside this site, especially for younger children.</p>' ||
  '<h2>Questions or concerns</h2>' ||
  '<p>Reach out any time through the Contact Us page — we''re happy to help.</p>',
  'What parents should know about MofiGames — the games on this site, data practices, and recommended settings.',
  false,
  0,
  true
)
on conflict (slug) do nothing;
