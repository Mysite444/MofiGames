-- Adds a `display_style` column to public.categories so admins can choose
-- how a category's games row looks on the homepage and on mobile.
--
-- Two styles are supported:
--   'default'  → standard horizontal landscape cards (202 × 114 px, 16:9)
--                Same as every existing genre row today.
--   'portrait' → tall portrait cards (202 × 304 px, 2:3)
--                Same visual style as the MofiGames Originals row.
--
-- The column is NOT NULL with a default of 'default' so the migration is
-- backwards-compatible: all existing rows (including the 18 built-in genres
-- seeded in 0065) silently inherit 'default' and the site renders exactly
-- as before until an admin picks a different template for a category.
--
-- A CHECK constraint keeps the value to the two known literals, rejecting
-- anything else at the DB level regardless of what the API layer does.

alter table public.categories
  add column if not exists display_style text not null default 'default'
  check (display_style in ('default', 'portrait'));

comment on column public.categories.display_style is
  'Homepage card layout template: ''default'' = landscape 16:9, ''portrait'' = tall 2:3 (Originals-style)';
