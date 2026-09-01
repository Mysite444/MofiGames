-- Migration: 0074_category_content_column
-- =============================================================================
-- Adds a `content` JSONB column to public.categories so admins can edit the
-- heading + paragraph sections that appear in the expandable "Show more" area
-- on every category page, without a code deployment.
--
-- Before this migration those blocks were hard-coded in
-- src/lib/categories.ts as a TypeScript array.  After this migration the
-- frontend reads the DB value first (via mergeCategoryWithDb) and falls back
-- to the static array only when the DB row carries an empty array.
--
-- Schema
-- ------
-- content  jsonb  NOT NULL  DEFAULT '[]'
--   An ordered array of { heading: string, body: string } objects.
--   Empty array  → the "Show more" section is hidden on the category page.
--   Non-empty    → rendered as h2 + p pairs inside the collapsible panel.
--
-- Idempotent: safe to run multiple times.
-- =============================================================================

alter table public.categories
  add column if not exists content jsonb not null default '[]'::jsonb;

comment on column public.categories.content is
  'Ordered content blocks shown in the "Show more" section on the category page. Each element: { heading: string, body: string }. Empty array hides the section.';

-- ---------------------------------------------------------------------------
-- Back-fill the 18 built-in genres with their original static content.
-- Only rows whose content is still the empty-array default are touched —
-- an admin who has already edited a category''s content is never overwritten.
-- ---------------------------------------------------------------------------

update public.categories set content = '[
  {"heading":"Play With Friends, Not Just Bots","body":"Multiplayer games turn any spare ten minutes into a hangout instead of a solo grind. Drop into a match, share a code, or jump into an open lobby — every game in this category is built around playing with other people, not against a script."},
  {"heading":"Co-op or Competitive, Your Call","body":"Some of these games are built for teaming up against a shared objective; others put you head-to-head against real opponents in real time. Either way, you''re never waiting on an AI to make its move."},
  {"heading":"No Downloads, No Sign-Up Walls","body":"Every multiplayer game here runs straight in the browser. Open a link, grab a game code, and you''re in — no client to install and no account required just to start playing."}
]'::jsonb
where slug = 'multiplayer' and content = '[]'::jsonb;

update public.categories set content = '[
  {"heading":"Fast Reflexes, Bigger Explosions","body":"Action games are built around split-second decisions — dodge, shoot, jump, repeat. If you want a game that rewards quick hands over long planning, this is the genre for it."},
  {"heading":"From 2D Platformers to Full 3D Combat","body":"This category spans everything from tight pixel-art run-and-gun games to full 3D shooters and battle royales, so there''s a pace and style here for almost any action fan."},
  {"heading":"Pick Up and Play in Seconds","body":"No lengthy tutorials — most of these games teach you the controls in the first ten seconds and let momentum do the rest."}
]'::jsonb
where slug = 'action' and content = '[]'::jsonb;

update public.categories set content = '[
  {"heading":"Lost Temples and Long Roads","body":"Adventure games are about exploration as much as action — ruins to uncover, maps to fill in, and stories that unfold as you go."},
  {"heading":"Puzzles Woven Into the Journey","body":"Expect environmental puzzles and light platforming mixed in with the exploring — progress usually means solving your way forward, not just fighting your way through."},
  {"heading":"A Whole World in One Tab","body":"Every adventure here is playable instantly, so a five-minute break can turn into a full expedition without ever leaving the browser."}
]'::jsonb
where slug = 'adventure' and content = '[]'::jsonb;

update public.categories set content = '[
  {"heading":"Coin-Op Classics, Zero Quarters","body":"Arcade games are built for one thing: chasing a higher score. Simple controls, instant restarts, and just enough challenge to keep you coming back for one more run."},
  {"heading":"Old-School Feel, New-School Polish","body":"Expect the pick-up-and-play spirit of classic arcade cabinets, rebuilt with modern art and smoother controls."},
  {"heading":"Perfect for Short Bursts","body":"Most rounds here last a minute or two, making this category the easiest one to fit into a quick break."}
]'::jsonb
where slug = 'arcade' and content = '[]'::jsonb;

update public.categories set content = '[
  {"heading":"Sharpen Your Mind, One Level at a Time","body":"Brain games trade reflexes for reasoning — pattern recognition, memory, logic, and lateral thinking all take center stage."},
  {"heading":"Something for Every Kind of Thinker","body":"From number puzzles to spatial reasoning challenges, this category covers a wide range of mental muscles, not just one type of puzzle."},
  {"heading":"Low Stress, High Focus","body":"No timers pressuring you into panic — most of these games are built to reward careful thinking over speed."}
]'::jsonb
where slug = 'brain' and content = '[]'::jsonb;

update public.categories set content = '[
  {"heading":"Pedal Down, Dust Up","body":"Driving games here range from realistic racing to over-the-top stunt courses, all built around the simple thrill of speed."},
  {"heading":"Racing, Drifting, and Everything Between","body":"Whether you want tight circuit racing, open off-road courses, or physics-based stunt driving, this category covers multiple flavors of \"behind the wheel\"."},
  {"heading":"Steering Wheel Not Required","body":"Every game here is fully playable with just a keyboard or touch controls, so you''re racing within seconds of clicking in."}
]'::jsonb
where slug = 'driving' and content = '[]'::jsonb;

update public.categories set content = '[
  {"heading":"Eat, Grow, Survive the Server","body":".io games drop you into a shared arena with real players from around the world — grow bigger, survive longer, and climb the leaderboard."},
  {"heading":"Simple Rules, Real Competition","body":"Most .io games can be explained in one sentence, but mastering the server against other live players takes real skill."},
  {"heading":"Jump In Anytime","body":"Matches are ongoing and open — there''s no queue or lobby wait, you just join the server and you''re already playing."}
]'::jsonb
where slug = 'io-games' and content = '[]'::jsonb;

update public.categories set content = '[
  {"heading":"Steady Aim, One Shot","body":"Shooting games are all about precision and timing, whether that''s a slow-scoping sniper level or a fast-twitch arena shooter."},
  {"heading":"Solo Missions or Live Opponents","body":"This category mixes single-player shooting campaigns with multiplayer arenas where the targets shoot back."},
  {"heading":"Every Style of Gunplay","body":"From top-down shooters to full 3D first-person action, there''s more than one way to line up a shot here."}
]'::jsonb
where slug = 'shooting-games' and content = '[]'::jsonb;

update public.categories set content = '[
  {"heading":"Quiet Brain-Melters, One Piece at a Time","body":"Puzzle games are about untangling a problem, not reacting fast — match, connect, slide, and sort your way to the solution."},
  {"heading":"Bite-Sized or Deep, Your Choice","body":"Some puzzles here take thirty seconds; others unfold across dozens of levels. Both styles live comfortably in this category."},
  {"heading":"No Pressure, Just Progress","body":"Most puzzle games let you take your time, making this category a good pick when you want something calmer than an action game."}
]'::jsonb
where slug = 'puzzle-games' and content = '[]'::jsonb;

update public.categories set content = '[
  {"heading":"Live Another Life","body":"Simulation games let you step into a job, a city, or a whole different life and run it your way, at your own pace."},
  {"heading":"Management Meets Make-Believe","body":"Expect a mix of light strategy and role-play — balancing resources or routines while building out a small world of your own."},
  {"heading":"Detail-Rich Without the Learning Curve","body":"These games often look complex from the thumbnail, but nearly all of them ease you in with simple, guided first steps."}
]'::jsonb
where slug = 'simulation' and content = '[]'::jsonb;

update public.categories set content = '[
  {"heading":"Pro Leagues and Backyard Rules","body":"Sports games here cover everything from realistic league play to arcade-style takes on football, basketball, soccer, and more."},
  {"heading":"Quick Matches, Real Competition","body":"Most games in this category are built around short matches, so you can play a full game in about the time it''d take to watch the highlights."},
  {"heading":"Solo Practice or Head-to-Head","body":"Play against the computer to warm up, or challenge a friend directly — most sports titles here support both."}
]'::jsonb
where slug = 'sports' and content = '[]'::jsonb;

update public.categories set content = '[
  {"heading":"Plan Three Moves Ahead","body":"Strategy games reward planning over reflexes — build, manage resources, and outmaneuver your opponent before the fight even starts."},
  {"heading":"Real-Time or Turn-Based","body":"This category mixes fast-paced real-time strategy with slower, more deliberate turn-based tactics, so you can pick the pace that suits your mood."},
  {"heading":"Small Maps, Big Decisions","body":"You don''t need hours to play a round — many of these strategy games are built for a focused, 10–20 minute session."}
]'::jsonb
where slug = 'strategy' and content = '[]'::jsonb;

update public.categories set content = '[
  {"heading":"How Much Do You Really Know?","body":"Trivia games put your general knowledge to the test across categories like history, pop culture, science, and more."},
  {"heading":"Solo Study or Group Showdown","body":"Play alone to sharpen your recall, or go head-to-head with friends to see who actually knows the most."},
  {"heading":"New Questions, Every Round","body":"Most trivia games here shuffle their question pool, so replaying doesn''t mean memorizing the same answers twice."}
]'::jsonb
where slug = 'trivia' and content = '[]'::jsonb;

update public.categories set content = '[
  {"heading":"Letters Into Points","body":"Word games turn vocabulary into a puzzle — spell, guess, and connect your way to the highest score."},
  {"heading":"Classic Formats, Fresh Twists","body":"Expect familiar word-game formats like guessing and word-building, each with its own spin to keep things interesting."},
  {"heading":"Great for Building Vocabulary","body":"Beyond the fun, this category doubles as light vocabulary practice — a good pick if you want a game that feels a little productive too."}
]'::jsonb
where slug = 'word' and content = '[]'::jsonb;

update public.categories set content = '[
  {"heading":"Easy to Play, Hard to Put Down","body":"Casual games are built to be picked up instantly, with simple controls and no steep learning curve standing between you and the fun."},
  {"heading":"Perfect for Short Breaks","body":"These are the games to open when you''ve got five spare minutes — quick to start, quick to enjoy, easy to close."},
  {"heading":"Something for Everyone","body":"This category is intentionally broad, covering light puzzles, gentle time-management games, and easygoing arcade action."}
]'::jsonb
where slug = 'casual' and content = '[]'::jsonb;

update public.categories set content = '[
  {"heading":"Roll, Move, Repeat","body":"Board games bring classic tabletop formats online — no setup, no missing pieces, and no need to gather everyone around the same table."},
  {"heading":"Timeless Games, Modern Convenience","body":"Play familiar board game formats with automatic rule-tracking, so you can focus on strategy instead of bookkeeping."},
  {"heading":"Play Solo or Pass the Turn","body":"Most board games here work against the computer or with friends taking turns on the same device."}
]'::jsonb
where slug = 'board' and content = '[]'::jsonb;

update public.categories set content = '[
  {"heading":"Shuffle Up and Deal","body":"Card games here cover classic formats — solitaire variants, trick-taking games, and casino-style favorites — all playable without a real deck."},
  {"heading":"Quick Hands, Quick Rounds","body":"A single round rarely takes long, making this category an easy pick for a short, focused session."},
  {"heading":"Rules Built In","body":"No need to remember every rule yourself — the game handles turn order, scoring, and valid moves, so you can just focus on playing well."}
]'::jsonb
where slug = 'card' and content = '[]'::jsonb;

update public.categories set content = '[
  {"heading":"Click. Upgrade. Repeat.","body":"Clicker games start simple — one click, one reward — and grow into layered systems of upgrades, automation, and long-term progress."},
  {"heading":"Progress Even When You''re Not Playing","body":"Many clicker games keep earning for you while you''re away, so coming back always feels like picking up right where momentum left off."},
  {"heading":"Endlessly Replayable","body":"There''s rarely a hard \"end\" to a clicker game — just bigger numbers and new upgrades to chase, which is exactly the appeal."}
]'::jsonb
where slug = 'clicker' and content = '[]'::jsonb;

-- Rollback:
--   alter table public.categories drop column if exists content;
