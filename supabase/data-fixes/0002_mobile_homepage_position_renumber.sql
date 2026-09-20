-- One-time data fix — NOT a schema migration, run manually in the Supabase
-- SQL editor. Companion to the code fix in
-- src/app/api/admin/mobile-homepage/route.ts.
--
-- Bug: the "Add Section" form in the Mobile Homepage admin never sent a
-- `position`, and mobileHomepageSectionCreateSchema defaulted the missing
-- value to 0. Every section created from the admin UI up to now landed at
-- position 0. With two or more rows tied at position 0, `ORDER BY
-- position` (used by both the admin list and the public mobile homepage
-- read) has no deterministic tiebreaker — so which section rendered where,
-- and whether a newly added one showed up at all in a given request/cache
-- refresh, was unpredictable. This is why "Sponsored" appeared to stop
-- rendering once "Latest Stock" was added.
--
-- The POST route now computes the correct next position for every new
-- section going forward, so this only needs to run once to fix the rows
-- that already exist. It renumbers EVERY row in mobile_homepage_sections
-- to 10, 20, 30… preserving whatever relative order they already sorted
-- into (position, then created_at — same tiebreak the code now uses), so
-- no section moves relative to any other; it just gives every row its own
-- unique slot.
--
-- Safe to re-run.

with ranked as (
  select
    id,
    row_number() over (order by position asc, created_at asc) as rn
  from public.mobile_homepage_sections
)
update public.mobile_homepage_sections s
set position = ranked.rn * 10
from ranked
where s.id = ranked.id;
