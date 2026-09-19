import type { Category } from "./types";

// These 18 genres are the real menu category list. Accent gradients are used
// ONLY on game thumbnails/hero art (for genre recognition) — all site chrome
// (menu, header, buttons, footer) stays black/white/glass per spec.
export const categories: Category[] = [
  { slug: "multiplayer", name: "Multiplayer", icon: "Users", colorFrom: "#7C5CFC", colorTo: "#2E1065",
    description: "Bring your friends.",
    content: [
      { heading: "Play With Friends, Not Just Bots",
        body: "Multiplayer games turn any spare ten minutes into a hangout instead of a solo grind. Drop into a match, share a code, or jump into an open lobby — every game in this category is built around playing with other people, not against a script." },
      { heading: "Co-op or Competitive, Your Call",
        body: "Some of these games are built for teaming up against a shared objective; others put you head-to-head against real opponents in real time. Either way, you're never waiting on an AI to make its move." },
      { heading: "No Downloads, No Sign-Up Walls",
        body: "Every multiplayer game here runs straight in the browser. Open a link, grab a game code, and you're in — no client to install and no account required just to start playing." },
    ] },
  { slug: "action", name: "Action", icon: "Zap", colorFrom: "#FF5D73", colorTo: "#7C1D33",
    description: "Fast reflexes, bigger explosions.",
    content: [
      { heading: "Fast Reflexes, Bigger Explosions",
        body: "Action games are built around split-second decisions — dodge, shoot, jump, repeat. If you want a game that rewards quick hands over long planning, this is the genre for it." },
      { heading: "From 2D Platformers to Full 3D Combat",
        body: "This category spans everything from tight pixel-art run-and-gun games to full 3D shooters and battle royales, so there's a pace and style here for almost any action fan." },
      { heading: "Pick Up and Play in Seconds",
        body: "No lengthy tutorials — most of these games teach you the controls in the first ten seconds and let momentum do the rest." },
    ] },
  { slug: "adventure", name: "Adventure", icon: "Compass", colorFrom: "#34D399", colorTo: "#0F5132",
    description: "Lost temples and long roads.",
    content: [
      { heading: "Lost Temples and Long Roads",
        body: "Adventure games are about exploration as much as action — ruins to uncover, maps to fill in, and stories that unfold as you go." },
      { heading: "Puzzles Woven Into the Journey",
        body: "Expect environmental puzzles and light platforming mixed in with the exploring — progress usually means solving your way forward, not just fighting your way through." },
      { heading: "A Whole World in One Tab",
        body: "Every adventure here is playable instantly, so a five-minute break can turn into a full expedition without ever leaving the browser." },
    ] },
  { slug: "arcade", name: "Arcade", icon: "Joystick", colorFrom: "#F472B6", colorTo: "#6B1645",
    description: "Coin-op classics, zero quarters.",
    content: [
      { heading: "Coin-Op Classics, Zero Quarters",
        body: "Arcade games are built for one thing: chasing a higher score. Simple controls, instant restarts, and just enough challenge to keep you coming back for one more run." },
      { heading: "Old-School Feel, New-School Polish",
        body: "Expect the pick-up-and-play spirit of classic arcade cabinets, rebuilt with modern art and smoother controls." },
      { heading: "Perfect for Short Bursts",
        body: "Most rounds here last a minute or two, making this category the easiest one to fit into a quick break." },
    ] },
  { slug: "brain", name: "Brain", icon: "Brain", colorFrom: "#818CF8", colorTo: "#312E81",
    description: "Sharpen your mind, one level at a time.",
    content: [
      { heading: "Sharpen Your Mind, One Level at a Time",
        body: "Brain games trade reflexes for reasoning — pattern recognition, memory, logic, and lateral thinking all take center stage." },
      { heading: "Something for Every Kind of Thinker",
        body: "From number puzzles to spatial reasoning challenges, this category covers a wide range of mental muscles, not just one type of puzzle." },
      { heading: "Low Stress, High Focus",
        body: "No timers pressuring you into panic — most of these games are built to reward careful thinking over speed." },
    ] },
  { slug: "driving", name: "Driving", icon: "Car", colorFrom: "#F59E0B", colorTo: "#78350F",
    description: "Pedal down, dust up.",
    content: [
      { heading: "Pedal Down, Dust Up",
        body: "Driving games here range from realistic racing to over-the-top stunt courses, all built around the simple thrill of speed." },
      { heading: "Racing, Drifting, and Everything Between",
        body: "Whether you want tight circuit racing, open off-road courses, or physics-based stunt driving, this category covers multiple flavors of \"behind the wheel.\"" },
      { heading: "Steering Wheel Not Required",
        body: "Every game here is fully playable with just a keyboard or touch controls, so you're racing within seconds of clicking in." },
    ] },
  { slug: "io-games", name: ".io Games", icon: "Globe", colorFrom: "#2DE2C5", colorTo: "#064E3B",
    description: "Eat, grow, survive the server.",
    content: [
      { heading: "Eat, Grow, Survive the Server",
        body: ".io games drop you into a shared arena with real players from around the world — grow bigger, survive longer, and climb the leaderboard." },
      { heading: "Simple Rules, Real Competition",
        body: "Most .io games can be explained in one sentence, but mastering the server against other live players takes real skill." },
      { heading: "Jump In Anytime",
        body: "Matches are ongoing and open — there's no queue or lobby wait, you just join the server and you're already playing." },
    ] },
  { slug: "shooting-games", name: "Shooting Games", icon: "Crosshair", colorFrom: "#F87171", colorTo: "#450A0A",
    description: "Steady aim, one shot.",
    content: [
      { heading: "Steady Aim, One Shot",
        body: "Shooting games are all about precision and timing, whether that's a slow-scoping sniper level or a fast-twitch arena shooter." },
      { heading: "Solo Missions or Live Opponents",
        body: "This category mixes single-player shooting campaigns with multiplayer arenas where the targets shoot back." },
      { heading: "Every Style of Gunplay",
        body: "From top-down shooters to full 3D first-person action, there's more than one way to line up a shot here." },
    ] },
  { slug: "puzzle-games", name: "Puzzle Games", icon: "Puzzle", colorFrom: "#A78BFA", colorTo: "#4C1D95",
    description: "Quiet brain-melters, one piece at a time.",
    content: [
      { heading: "Quiet Brain-Melters, One Piece at a Time",
        body: "Puzzle games are about untangling a problem, not reacting fast — match, connect, slide, and sort your way to the solution." },
      { heading: "Bite-Sized or Deep, Your Choice",
        body: "Some puzzles here take thirty seconds; others unfold across dozens of levels. Both styles live comfortably in this category." },
      { heading: "No Pressure, Just Progress",
        body: "Most puzzle games let you take your time, making this category a good pick when you want something calmer than an action game." },
    ] },
  { slug: "simulation", name: "Simulation", icon: "Settings2", colorFrom: "#38BDF8", colorTo: "#0C4A6E",
    description: "Live another life.",
    content: [
      { heading: "Live Another Life",
        body: "Simulation games let you step into a job, a city, or a whole different life and run it your way, at your own pace." },
      { heading: "Management Meets Make-Believe",
        body: "Expect a mix of light strategy and role-play — balancing resources or routines while building out a small world of your own." },
      { heading: "Detail-Rich Without the Learning Curve",
        body: "These games often look complex from the thumbnail, but nearly all of them ease you in with simple, guided first steps." },
    ] },
  { slug: "sports", name: "Sports", icon: "Trophy", colorFrom: "#22D3EE", colorTo: "#155E75",
    description: "Pro leagues and backyard rules.",
    content: [
      { heading: "Pro Leagues and Backyard Rules",
        body: "Sports games here cover everything from realistic league play to arcade-style takes on football, basketball, soccer, and more." },
      { heading: "Quick Matches, Real Competition",
        body: "Most games in this category are built around short matches, so you can play a full game in about the time it'd take to watch the highlights." },
      { heading: "Solo Practice or Head-to-Head",
        body: "Play against the computer to warm up, or challenge a friend directly — most sports titles here support both." },
    ] },
  { slug: "strategy", name: "Strategy", icon: "Castle", colorFrom: "#A3E635", colorTo: "#365314",
    description: "Plan three moves ahead.",
    content: [
      { heading: "Plan Three Moves Ahead",
        body: "Strategy games reward planning over reflexes — build, manage resources, and outmaneuver your opponent before the fight even starts." },
      { heading: "Real-Time or Turn-Based",
        body: "This category mixes fast-paced real-time strategy with slower, more deliberate turn-based tactics, so you can pick the pace that suits your mood." },
      { heading: "Small Maps, Big Decisions",
        body: "You don't need hours to play a round — many of these strategy games are built for a focused, 10–20 minute session." },
    ] },

  // Added per the mobile-home spec screenshots (Trivia/Word/Casual/Board/Card/Clicker rows)
  { slug: "trivia", name: "Trivia", icon: "CircleHelp", colorFrom: "#FFD60A", colorTo: "#7A4E00",
    description: "How much do you really know?",
    content: [
      { heading: "How Much Do You Really Know?",
        body: "Trivia games put your general knowledge to the test across categories like history, pop culture, science, and more." },
      { heading: "Solo Study or Group Showdown",
        body: "Play alone to sharpen your recall, or go head-to-head with friends to see who actually knows the most." },
      { heading: "New Questions, Every Round",
        body: "Most trivia games here shuffle their question pool, so replaying doesn't mean memorizing the same answers twice." },
    ] },
  { slug: "word", name: "Word", icon: "SpellCheck2", colorFrom: "#5EEAD4", colorTo: "#134E4A",
    description: "Letters into points.",
    content: [
      { heading: "Letters Into Points",
        body: "Word games turn vocabulary into a puzzle — spell, guess, and connect your way to the highest score." },
      { heading: "Classic Formats, Fresh Twists",
        body: "Expect familiar word-game formats like guessing and word-building, each with its own spin to keep things interesting." },
      { heading: "Great for Building Vocabulary",
        body: "Beyond the fun, this category doubles as light vocabulary practice — a good pick if you want a game that feels a little productive too." },
    ] },
  { slug: "casual", name: "Casual", icon: "Gamepad2", colorFrom: "#FDBA74", colorTo: "#7C3A0A",
    description: "Easy to play, hard to put down.",
    content: [
      { heading: "Easy to Play, Hard to Put Down",
        body: "Casual games are built to be picked up instantly, with simple controls and no steep learning curve standing between you and the fun." },
      { heading: "Perfect for Short Breaks",
        body: "These are the games to open when you've got five spare minutes — quick to start, quick to enjoy, easy to close." },
      { heading: "Something for Everyone",
        body: "This category is intentionally broad, covering light puzzles, gentle time-management games, and easygoing arcade action." },
    ] },
  { slug: "board", name: "Board", icon: "Dices", colorFrom: "#D97706", colorTo: "#451A03",
    description: "Roll, move, repeat.",
    content: [
      { heading: "Roll, Move, Repeat",
        body: "Board games bring classic tabletop formats online — no setup, no missing pieces, and no need to gather everyone around the same table." },
      { heading: "Timeless Games, Modern Convenience",
        body: "Play familiar board game formats with automatic rule-tracking, so you can focus on strategy instead of bookkeeping." },
      { heading: "Play Solo or Pass the Turn",
        body: "Most board games here work against the computer or with friends taking turns on the same device." },
    ] },
  { slug: "card", name: "Card", icon: "Spade", colorFrom: "#E879F9", colorTo: "#701A75",
    description: "Shuffle up and deal.",
    content: [
      { heading: "Shuffle Up and Deal",
        body: "Card games here cover classic formats — solitaire variants, trick-taking games, and casino-style favorites — all playable without a real deck." },
      { heading: "Quick Hands, Quick Rounds",
        body: "A single round rarely takes long, making this category an easy pick for a short, focused session." },
      { heading: "Rules Built In",
        body: "No need to remember every rule yourself — the game handles turn order, scoring, and valid moves, so you can just focus on playing well." },
    ] },
  { slug: "clicker", name: "Clicker", icon: "MousePointerClick", colorFrom: "#FB923C", colorTo: "#7C2D12",
    description: "Click. Upgrade. Repeat.",
    content: [
      { heading: "Click. Upgrade. Repeat.",
        body: "Clicker games start simple — one click, one reward — and grow into layered systems of upgrades, automation, and long-term progress." },
      { heading: "Progress Even When You're Not Playing",
        body: "Many clicker games keep earning for you while you're away, so coming back always feels like picking up right where momentum left off." },
      { heading: "Endlessly Replayable",
        body: "There's rarely a hard \"end\" to a clicker game — just bigger numbers and new upgrades to chase, which is exactly the appeal." },
    ] },
];

export function getCategoryBySlug(slug: string): Category | undefined {
  return categories.find((c) => c.slug === slug);
}

/**
 * Merges a single static category with its DB counterpart.
 *
 * DB data wins for every user-editable field (name, icon, colors,
 * description, SEO, homepage placement, displayStyle). The static
 * `content` blocks are preserved because the DB has no content column —
 * admins edit that copy through the source file only.
 *
 * If `dbCat` is undefined the static fallback is returned unchanged.
 */
export function mergeCategoryWithDb(
  staticCat: Category,
  dbCat: Category | undefined,
): Category {
  if (!dbCat) return staticCat;
  // Spread order: static first so DB values overwrite everything.
  // content: prefer the DB array when non-empty (admin has edited it);
  //          fall back to the static array when the DB row is empty/null.
  return {
    ...staticCat,
    ...dbCat,
    content:
      dbCat.content && dbCat.content.length > 0
        ? dbCat.content
        : staticCat.content,
  };
}

/**
 * Merges the full list of static built-in categories with whatever the
 * DB currently holds, then appends any extra categories that only exist
 * in the DB (custom genres added through the admin panel).
 *
 * Call this instead of the raw `categories` import whenever you need a
 * list that respects admin edits to the 18 built-in genres.
 */
export function mergeAllCategoriesWithDb(dbCategories: Category[]): Category[] {
  const staticSlugs = new Set(categories.map((c) => c.slug));
  const dbCatMap = new Map(dbCategories.map((c) => [c.slug, c]));
  return [
    // Built-in categories: DB data overlaid on the static fallback.
    ...categories.map((staticCat) =>
      mergeCategoryWithDb(staticCat, dbCatMap.get(staticCat.slug)),
    ),
    // Custom categories that only exist in the DB.
    ...dbCategories.filter((c) => !staticSlugs.has(c.slug)),
  ];
}
