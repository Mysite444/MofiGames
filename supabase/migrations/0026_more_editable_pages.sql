-- MofiGames — Phase 26: About Us, Contact Us, Privacy Policy, Disclaimer,
-- Terms and Conditions, and Kids Message become admin-editable pages too
-- (same treatment migration 0025 gave Parents Info), and all seven now
-- render in the sidebar/drawer "Pages" section dynamically instead of via
-- a hardcoded list — so a brand-new custom page created in
-- Admin → Content Management → Pages shows up in the menu automatically.
-- Run in Supabase SQL Editor. Safe to run multiple times.

-- ---------------------------------------------------------------------------
-- sort_order below fixes their menu position: 10–60 for the newly-seeded
-- pages, with Parents Info (already inserted at sort_order 0 by migration
-- 0025) bumped to 70 to land after them, in the same order the sidebar
-- showed them before this change. "My Profile" and "Blog & News" stay
-- hardcoded in NavList.tsx — they're app features, not content pages.
-- ---------------------------------------------------------------------------
insert into public.pages (slug, title, content, meta_description, show_in_nav, sort_order, is_published)
values
  (
    'about',
    'About Us',
    '<p>MofiGames is a free browser gaming portal. No downloads, no installs — pick a category, click a game, and play straight from your browser on desktop, tablet, or phone.</p>' ||
    '<h2>What we offer</h2>' ||
    '<p>Our catalog spans hundreds of games across dozens of categories, from quick arcade rounds to longer strategy and simulation sessions.</p>' ||
    '<h2>Our mission</h2>' ||
    '<p>Keep casual gaming simple: fast loading pages, a clean catalog, and no clutter between you and the games you want to play.</p>',
    'Who''s behind MofiGames — a free browser gaming portal with no downloads or installs required.',
    true, 10, true
  ),
  (
    'contact',
    'Contact Us',
    '<p>We''d love to hear from you. Reach out through any of the channels below.</p>' ||
    '<ul><li><strong>Email:</strong> support@mofigames.com</li><li><strong>Live chat:</strong> Coming soon</li></ul>' ||
    '<h2>Response time</h2>' ||
    '<p>We typically reply within 1–2 business days.</p>',
    'Get in touch with the MofiGames team — questions, feedback, or a bug to report.',
    true, 20, true
  ),
  (
    'privacy-policy',
    'Privacy Policy',
    '<p>This Privacy Policy explains what information MofiGames collects, how it''s used, and the choices available to you.</p>' ||
    '<h2>Information we collect</h2>' ||
    '<p>Depending on how the site is built out, this may include technical data (browser type, device, IP address), usage data (pages visited, games played), and any information you submit directly, such as through a contact form.</p>' ||
    '<h2>How we use it</h2>' ||
    '<p>To operate and improve the site, understand which games are popular, fix bugs, and respond to support requests.</p>' ||
    '<h2>Cookies</h2>' ||
    '<p>The site may use cookies or similar local storage to remember preferences and measure traffic. You can usually control cookies through your browser settings.</p>' ||
    '<h2>Third parties</h2>' ||
    '<p>If games are embedded from third-party providers, those providers may have their own privacy practices — review their policies separately.</p>' ||
    '<h2>Children''s privacy</h2>' ||
    '<p>If this site is intended for or likely to be used by children, additional legal obligations apply in most regions (for example COPPA in the U.S. or GDPR-K in the EU/UK). These requirements need dedicated legal review.</p>' ||
    '<h2>Contact</h2>' ||
    '<p>Questions about this policy can be sent via the Contact Us page.</p>',
    'How MofiGames collects, uses, and protects your information.',
    true, 30, true
  ),
  (
    'disclaimer',
    'Disclaimer',
    '<h2>No warranty</h2>' ||
    '<p>Games and content on MofiGames are provided "as is" without warranties of any kind. We don''t guarantee uninterrupted availability, accuracy, or that any game will be free of bugs.</p>' ||
    '<h2>Third-party games</h2>' ||
    '<p>Where games are sourced or embedded from third parties, MofiGames isn''t responsible for their content, behavior, or any external links they may contain.</p>' ||
    '<h2>External links</h2>' ||
    '<p>Links to external sites are provided for convenience. We don''t control and aren''t responsible for the content of external sites.</p>' ||
    '<h2>Limitation of liability</h2>' ||
    '<p>To the fullest extent permitted by law, MofiGames isn''t liable for any damages arising from use of the site.</p>',
    'Legal disclaimer covering game content, third-party links, and limitation of liability on MofiGames.',
    true, 40, true
  ),
  (
    'terms',
    'Terms and Conditions',
    '<p>By using MofiGames, you agree to these terms. Please read them before playing.</p>' ||
    '<h2>Use of the site</h2>' ||
    '<p>MofiGames is provided for personal, non-commercial entertainment. Don''t use the site to distribute malware, scrape content at scale, or interfere with normal operation.</p>' ||
    '<h2>Accounts</h2>' ||
    '<p>If accounts are added later, you''re responsible for keeping your credentials secure and for activity under your account.</p>' ||
    '<h2>Content ownership</h2>' ||
    '<p>Games featured on the site remain the property of their respective creators or publishers. Site design, branding, and original text belong to MofiGames.</p>' ||
    '<h2>Changes</h2>' ||
    '<p>These terms may be updated from time to time; continued use means you accept the changes.</p>',
    'The terms and conditions for using MofiGames.',
    true, 50, true
  ),
  (
    'kids-message',
    'A Message for Kids',
    '<p>We''re glad you''re having fun on MofiGames! Here are a few friendly reminders:</p>' ||
    '<h2>Take breaks</h2>' ||
    '<p>Stand up, stretch, and rest your eyes every so often. Games will still be here when you''re back.</p>' ||
    '<h2>Keep your info private</h2>' ||
    '<p>Never share your full name, address, school, or password with anyone online — not even in a game. If something ever asks you to, check with a parent or guardian first.</p>' ||
    '<h2>Ask a grown-up</h2>' ||
    '<p>If anything online makes you feel confused, uncomfortable, or worried, tell a parent, guardian, or teacher right away. You won''t be in trouble for asking.</p>' ||
    '<h2>Be kind</h2>' ||
    '<p>If a game lets you play with others, be a good sport — win or lose.</p>',
    'A friendly safety reminder for kids playing games on MofiGames.',
    true, 60, true
  )
on conflict (slug) do nothing;

-- Fold Parents Info into the same dynamic nav position, after the pages
-- just seeded above. Guarded so it only touches the row if it's still at
-- the original migration-0025 defaults (won't clobber a manual edit).
update public.pages
set show_in_nav = true, sort_order = 70
where slug = 'parents-info' and show_in_nav = false and sort_order = 0;
