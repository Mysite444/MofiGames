-- Seeds the 18 "built-in" genre categories (src/lib/categories.ts) into
-- public.categories.
--
-- Root cause: games.category_slug has `references public.categories(slug)`
-- (0003_games_and_admin.sql), so a game can only be filed under a category
-- that already has a row in this table. But no migration ever inserted rows
-- for the 18 built-in genres shown across the site's menu/browse pages
-- (Action, Adventure, Arcade, Brain, Driving, .io Games, Shooting Games,
-- Puzzle Games, Simulation, Sports, Strategy, Trivia, Word, Casual, Board,
-- Card, Clicker, Multiplayer) — that list only ever existed in code. The
-- categories table started empty, so the Admin → Games "Category" dropdown
-- (and Admin → Categories list) only ever showed whatever an admin had
-- manually created by hand (e.g. just "Multiplayer"), even though the rest
-- of the site already treats all 18 as valid categories.
--
-- This is additive and idempotent: `on conflict (slug) do nothing` means it
-- never overwrites a category an admin already created/edited (including a
-- manually-added "multiplayer" row), and running this migration twice is
-- always safe.
--
-- Note: these rows don't create duplicate homepage sections or duplicate
-- /[slug] pages. Every page that lists real DB categories alongside the
-- built-in ones (src/app/page.tsx, src/app/categories/page.tsx) already
-- filters out any DB row whose slug matches a built-in slug, and
-- src/app/[slug]/page.tsx's resolveSlug() checks the built-in catalogue
-- before ever falling back to the DB. These rows exist purely to satisfy
-- the FK and to make the built-in genres selectable in the admin panel.
insert into public.categories (slug, name, icon, color_from, color_to, description, sort_order)
values
  ('multiplayer',     'Multiplayer',     'Users',             '#7C5CFC', '#2E1065', 'Bring your friends.',                         10),
  ('action',          'Action',          'Zap',               '#FF5D73', '#7C1D33', 'Fast reflexes, bigger explosions.',           20),
  ('adventure',       'Adventure',       'Compass',           '#34D399', '#0F5132', 'Lost temples and long roads.',                30),
  ('arcade',          'Arcade',          'Joystick',          '#F472B6', '#6B1645', 'Coin-op classics, zero quarters.',            40),
  ('brain',           'Brain',           'Brain',             '#818CF8', '#312E81', 'Sharpen your mind, one level at a time.',     50),
  ('driving',         'Driving',         'Car',               '#F59E0B', '#78350F', 'Pedal down, dust up.',                        60),
  ('io-games',        '.io Games',       'Globe',             '#2DE2C5', '#064E3B', 'Eat, grow, survive the server.',              70),
  ('shooting-games',  'Shooting Games',  'Crosshair',         '#F87171', '#450A0A', 'Steady aim, one shot.',                       80),
  ('puzzle-games',    'Puzzle Games',    'Puzzle',            '#A78BFA', '#4C1D95', 'Quiet brain-melters, one piece at a time.',   90),
  ('simulation',      'Simulation',      'Settings2',         '#38BDF8', '#0C4A6E', 'Live another life.',                         100),
  ('sports',          'Sports',          'Trophy',            '#22D3EE', '#155E75', 'Pro leagues and backyard rules.',            110),
  ('strategy',        'Strategy',        'Castle',            '#A3E635', '#365314', 'Plan three moves ahead.',                    120),
  ('trivia',          'Trivia',          'CircleHelp',        '#FFD60A', '#7A4E00', 'How much do you really know?',              130),
  ('word',            'Word',            'SpellCheck2',       '#5EEAD4', '#134E4A', 'Letters into points.',                       140),
  ('casual',          'Casual',          'Gamepad2',          '#FDBA74', '#7C3A0A', 'Easy to play, hard to put down.',            150),
  ('board',           'Board',           'Dices',             '#D97706', '#451A03', 'Roll, move, repeat.',                        160),
  ('card',            'Card',            'Spade',             '#E879F9', '#701A75', 'Shuffle up and deal.',                       170),
  ('clicker',         'Clicker',         'MousePointerClick', '#FB923C', '#7C2D12', 'Click. Upgrade. Repeat.',                    180)
on conflict (slug) do nothing;
