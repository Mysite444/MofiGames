-- Migration: 0029_category_homepage_placement
-- Adds three columns to the categories table so the admin panel can
-- control exactly where each category row appears on the homepage
-- without any code deployments.
--
-- show_on_homepage  → hides the row entirely when false (default true)
-- homepage_position → integer priority; lower = higher on page;
--                     NULL means "auto-append at the bottom" (existing behaviour)
-- homepage_label    → custom section heading override, e.g. "Play with Friends"
--                     instead of "Multiplayer"; falls back to name when NULL

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS show_on_homepage  BOOLEAN      NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS homepage_position INTEGER               DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS homepage_label    TEXT                  DEFAULT NULL;

COMMENT ON COLUMN public.categories.show_on_homepage IS
  'When false the category row is hidden from the homepage entirely.';

COMMENT ON COLUMN public.categories.homepage_position IS
  'Optional sort priority for the homepage row. Lower numbers appear first (e.g. 10 appears above 20). NULL = auto-placed at the very bottom of the page.';

COMMENT ON COLUMN public.categories.homepage_label IS
  'Custom section heading shown on the homepage row. Falls back to the category name when NULL or empty.';

-- Index so the homepage query can ORDER BY homepage_position cheaply.
CREATE INDEX IF NOT EXISTS idx_categories_homepage_position
  ON public.categories (homepage_position)
  WHERE homepage_position IS NOT NULL;
