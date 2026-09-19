# MofiGames (Next.js front end)

A black/white/glassmorphism game portal: a hover-expand desktop sidebar menu,
a featured hero carousel, and horizontally-scrolling rows of games — fully
responsive, with native touch swipe on mobile.

Auth is real (Supabase) — see **"Backend (Supabase)"** below. Games data is
still local — see **"Wiring up real games"**.

## Run it

```bash
npm install
```

Create `.env.local` (see **"Backend (Supabase)"** below for where to get
these values):

```bash
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

```bash
npm run dev
```

Open http://localhost:3000.

## Backend (Supabase)

Auth (login/signup/guest sessions) is backed by a real Supabase project —
no more localStorage-only accounts.

- **Client setup**: `src/lib/supabase/client.ts` (browser), `src/lib/supabase/server.ts`
  (server components/route handlers), `src/middleware.ts` (keeps sessions
  fresh on every request).
- **Auth logic**: `src/lib/auth-context.tsx` — same `useAuth()` interface
  the rest of the app already used, now backed by real Supabase Auth calls
  instead of localStorage.
- **Database schema**: `supabase/migrations/0001_init.sql` — run this once
  in the Supabase Dashboard → SQL Editor. Creates a `profiles` table (one
  row per user, auto-created on signup via a trigger) with Row Level
  Security enabled: profiles are publicly readable, but a user can only
  ever update their own row.
- **Guest login** uses Supabase's anonymous auth — enable it in the
  dashboard under Authentication → Providers → Anonymous Sign-Ins, or the
  "Continue as Guest" button will fail.
- **Email confirmation**: if your project has "Confirm email" turned on
  (Authentication → Providers → Email), new signups won't get a session
  until they click the confirmation link — the signup page already handles
  this and shows a "check your inbox" message instead of erroring.
- **Keys**: only the public `anon` key ever goes in `.env.local` /
  `NEXT_PUBLIC_*` vars. The `service_role` key (if you ever need it for an
  admin task) must never be exposed to the browser — server-only, and never
  committed.

### Phase 2: favorites + recently played

- **Database schema**: `supabase/migrations/0002_favorites_recently_played.sql`
  — run this once in the SQL Editor, same as the phase 1 migration. Creates
  `favorites` and `recently_played` tables, both with RLS so a user can only
  ever read/write their own rows.
- **Sync helpers**: `src/lib/supabase/game-activity.ts` — plain functions
  for fetching/writing those two tables.
- **The store**: `src/lib/game-library.ts` is unchanged on the outside —
  every hook/function other components use (`useFavoriteSlugs`,
  `useIsFavorited`, `toggleFavorite`, `useRecentlyPlayedSlugs`,
  `recordPlayed`, `clearRecentlyPlayed`) has the exact same signature as
  before. Under the hood, it now writes through to Supabase whenever
  someone's signed in (including guest sessions).
- **The bridge**: `src/components/LibrarySync.tsx`, rendered once in the
  root layout, watches auth state and tells the store who's signed in.
- **Signed-out visitors** still get the old localStorage-only behavior —
  no account required to favorite something or have "recently played"
  tracked, same as before.
- **Known limitation**: logging in doesn't merge pre-login local activity
  into the account yet — it replaces local state with whatever's already
  saved to that account. A "migrate guest activity on login" flow is a
  reasonable future addition, not yet built.

### Phase 3: games + categories managed from an admin panel

- **Database schema**: `supabase/migrations/0003_games_and_admin.sql` —
  run this once, same as the others. Creates `games` and `categories`
  tables, an `is_admin` flag on `profiles`, RLS so only admins can write
  to either table, and two storage buckets (`game-thumbnails`,
  `game-files`) with admin-only write / public read.
- **Becoming an admin**: there's no in-app way to grant the *first* admin
  (chicken-and-egg problem) — do it once manually: Supabase Dashboard →
  Table Editor → `profiles` → find your row → set `is_admin` to `true`.
  After that, an "Admin Panel" link appears in your account menu.
- **The admin panel**: `/admin` (guarded server-side in
  `src/app/admin/layout.tsx` — non-admins get redirected before anything
  renders). `/admin/games` and `/admin/categories` are full CRUD:
  - Games can play either via an **embed URL** (hosted elsewhere, like
    CrazyGames) or an **uploaded build** (select the game's build folder —
    it needs an `index.html` — and every file uploads to the `game-files`
    bucket preserving folder structure).
  - Thumbnails can be a pasted **image URL** or an **uploaded image file**.
  - Games can be saved as a draft (`is_published = false`) — drafts are
    only visible in the admin panel and to admins, not on the public site.
- **Still static**: the public-facing site (homepage, category pages,
  game player, search, leaderboard, sitemap) still reads from the old
  procedurally-generated placeholder data in `src/lib/games.ts` — it
  hasn't been switched over to read from the new `games`/`categories`
  tables yet. That's the next step once you've added some real games
  through the admin panel and want to see them live on the site.

### Cutting the public site over to real games (in progress, staged)

This touches ~28 files across the site (server-rendered pages *and*
client components that read game data directly), so it's being rolled
out in stages rather than all at once.

**Stage 1 (done)**: `/game/[slug]` — a real game's page works fully: real
thumbnail, real embed/uploaded build playing in an actual iframe
(`src/components/PlayFrame.tsx`), real title/rating/description.

**Stage 2 (done)**: real games are now discoverable across the whole
public site, not just their direct URL:
- **Homepage**: a "Your Games" row up top showing every real game, real
  games merged into the matching category rows (e.g. a real game in
  "puzzle" shows up in the existing Puzzle row), and a brand-new category
  row for any real category that doesn't match a placeholder one.
- **Category pages** (`/category/[slug]`): merged in, including entirely
  new categories added through the admin panel (not just the placeholder
  set).
- **`/categories`, `/latest-games`, `/popular-games`, `/updated-games`,
  `/leaderboard`, `/about`**: all merged in — real games are (by
  definition) the newest on "Latest Games", sort naturally by plays on
  "Popular"/"Leaderboard", and appear on "Updated" if tagged `UPDATED`.
- **Search, Random Game button**: search across real + placeholder games;
  random game picks from both pools.
- **Favorites / Recently Played / Profile pages**: now resolve real game
  slugs correctly — favoriting/playing a real game (which already saved
  to Supabase since Phase 2) now actually displays in these lists too.

How it works under the hood: `src/lib/games-mapping.ts` has the shared
row→Game/Category mapping. Server Components (pages) call
`src/lib/games-server.ts` (awaits Supabase directly). Client components
can't `await` mid-render, so they go through
`src/lib/supabase/real-games-client.ts` (a module-level cache, fetched
once, subscribed to via `useSyncExternalStore` — same pattern as
`game-library.ts`) and the convenience hooks in `src/lib/games-merged.ts`
(`useMergedGames`, `useGameBySlug`, `useCategoryBySlug`,
`useGamesByCategory`). `src/components/RealGamesSync.tsx` in the root
layout kicks off that fetch as early as possible.

**Known gaps, scoped out for now**:
- This cutover focused on **desktop**. Mobile home (`MobileHome.tsx`) and
  the mobile drawer's featured-games list still only show placeholder
  games — same underlying hooks/functions are available, just not wired
  into those components yet.
- Curated/heuristic rows on the homepage (Featured, Trending, Editor's
  Picks, MofiGames Originals) still only pull from the placeholder
  generator's own tagging logic — real games don't feed into those
  specific rows' selection algorithm, even though they do get their own
  dedicated "Your Games" row and appear in every category-based row.
- No "migrate guest activity into your account on login" flow (noted back
  in the Phase 2 section too).

### Phase 4: real comments, secure API routes, and play-count tracking

Two things were genuinely missing a backend before this pass — this phase
adds both, plus a route-handler layer in front of the admin panel's writes.

- **Database schema**: `supabase/migrations/0004_comments_and_plays.sql` —
  run this once, same as the others. Adds `comments` and `comment_likes`
  tables (with RLS, and a trigger that caps replies at one level deep,
  matching the UI), and a `increment_game_plays(game_slug)` function.
- **Comments are now real**: they used to live only in `localStorage` —
  no database table, invisible to anyone else, gone if you cleared your
  browser. `src/lib/comments.ts` now talks to `/api/comments/**`, so
  comments, replies, and likes are shared, persistent, and tied to a real
  account (or guest session) server-side rather than a client-supplied
  name/email. The `CommentsSection` UI is unchanged — same layout,
  same interactions — it just posts to the network instead of `localStorage`
  now, optimistically, with rollback if a request fails.
- **Play counts now actually increment**: `games.plays` had a value but
  nothing ever updated it (the table has no non-admin write policy, on
  purpose — a blanket "anyone can update games" policy would let visitors
  edit titles too). `POST /api/games/[slug]/play` calls the new
  `increment_game_plays` Postgres function instead, which can only ever
  add 1 to `plays` on an already-published game and nothing else. Fires
  automatically whenever `recordPlayed()` runs (i.e. whenever someone
  presses Play), for signed-in and guest visitors alike.
- **Admin writes go through route handlers**: creating/updating/deleting a
  game or category now calls `/api/admin/games/**` and
  `/api/admin/categories/**` (still using the same anon-key + RLS model as
  everywhere else — no service-role key involved) instead of hitting
  Supabase directly from the browser. The routes re-validate the whole
  payload server-side with `zod` (required fields per play type, slug
  format, hex colors, rating/sort-order ranges) and turn constraint
  violations (duplicate slug, missing category, category still in use)
  into specific, readable error messages. RLS is still what actually
  enforces admin-only access either way; this is a second, explicit layer
  in front of it. `src/lib/supabase/admin-content.ts` keeps the exact same
  exported functions, so neither admin UI component changed.
  Reads (listing/fetching games and categories for the admin panel) stay
  as direct Supabase calls — RLS already scopes those correctly and a
  route handler wouldn't add anything.
- **New dependency**: `zod`, for the request validation above. Run
  `npm install` after pulling this in.

### Phase 5: comment moderation

Phase 4 let a comment's own author delete it, but gave admins no way to
remove someone else's (spam, abuse, etc.) — this closes that gap.

- **Database**: `supabase/migrations/0005_comment_moderation.sql` — adds
  an RLS policy letting admins (`public.is_admin()`, same helper the
  games/categories policies already use) delete any comment, plus an
  index the moderation list's sort relies on.
- **`DELETE /api/comments/[id]`** now allows either the comment's own
  author *or* an admin, instead of only the author.
- **New admin page**: `/admin/comments` — every comment across every
  game, newest first, with a game-slug filter, a text search (comment
  body or author name), pagination, and a delete button. Reuses the same
  delete route the public comment section uses.

### Phase 6: comment rate-limiting, guest→account upgrade, and full mobile/curated-row parity with desktop

Closes out the remaining gaps called out at the end of Phase 5.

- **Comment rate-limiting**: posting had no throttle beyond "must be
  signed in." `src/lib/supabase/comment-rate-limit.ts` checks the
  `comments` table itself (not an in-memory counter — that wouldn't be
  reliable across serverless instances) and rejects with 429 if a user
  posts faster than once every 8 seconds, or more than 30 times an hour.
  `CommentsSection` shows the rejection message inline near the compose
  box instead of the comment just silently vanishing.
- **Guest → real account now upgrades in place**: signing up used to
  always call `signUp()`, which creates a brand-new user id — meaning a
  guest's favorites, recently-played, and comments were silently orphaned
  the moment they made an account. `signup()` now detects an active guest
  session and calls `updateUser({ email, password })` to *link* an email
  to it instead, which Supabase keeps at the same user id — so everything
  tied to that id carries over automatically, with nothing to migrate.
  Falls back to signing into the existing account if that email already
  belongs to one. **Requires enabling "manual linking" in your Supabase
  project's Auth settings** (Authentication → Sign In / Providers) — this
  is a one-time dashboard toggle Supabase requires for identity linking to
  work at all; nothing else to configure.
- **Mobile now has full parity with desktop for real games**: `MobileHome`
  takes the same `realGames`/`realCategories` props the desktop homepage
  already computed and merges them into every category row plus a new
  "Your Games" row, exactly like desktop. The mobile drawer's game list
  now also shows a "Your Games" row (via the same site-wide real-games
  cache used elsewhere) above its existing Featured Games list.
- **Curated homepage rows now include real games**: Featured, Trending
  ("Can't Stop Playing" + the Top Picks pool), New Games, Recently
  Updated, and Editor's Picks previously only pulled from the placeholder
  generator — a real game could never appear in any of them, even though
  the dedicated `/latest-games`, `/popular-games`, and `/updated-games`
  pages already merged real games in. `src/lib/curated-games.ts` mirrors
  those same established rules (real games always count as "newest";
  `UPDATED`/`HOT`-tagged real games lead those rows; every game ranked by
  plays for Trending) so the homepage agrees with those pages instead of
  being the one place still out of sync. Both the desktop homepage and
  `MobileHome` call the same helpers, so the two surfaces can't drift.

### Phase 7: menu/category button audit — every entry point now reaches real categories, and a latent icon crash was closed off

You asked me to verify every button and category link actually works, on
both desktop and mobile — this found two real bugs, not just gaps:

- **Real categories were unreachable from the menu and quick-link grids.**
  A category added purely through the admin panel (no matching placeholder
  slug) had a working page at `/category/that-slug` and its own homepage
  row, but no menu button anywhere actually pointed at it — not the
  desktop sidebar, not the mobile drawer (same shared `NavList`
  component), not the homepage's "browse categories" quick-grid (desktop
  `CategoryQuickLinks` or mobile `CategoryQuickGrid`). Only the full
  `/categories` index page and search already included it. All three
  fixed the same way: pulling real categories from the site-wide
  `useRealGames()` client cache (the same one `RealGamesSync` in the root
  layout already populates everywhere) and merging in any that don't
  match a placeholder slug — consistent with how `/categories` already
  did it.
- **A bad icon name on a real category could crash every page it appeared
  on.** The admin category form's icon field was free text with just a
  caption asking you to match a real Lucide icon name — nothing stopped
  you from typing something that isn't one, and 13 different places in
  the app do `iconMap[category.icon]` and render whatever comes back,
  which throws if that's `undefined`. Fixed at the root instead of
  patching 13 call sites: `mapDbCategoryRow` (the one shared function both
  the server and client real-games code paths go through) now validates
  the icon and falls back to a safe default, the categories API rejects
  an invalid icon at creation/update time, and the admin form's icon
  field is now a `<select>` of the actual valid options instead of free
  text — so this can't happen going forward, and can't crash anything
  even if a bad value ever ends up in the database some other way.

## Theme: black / white / glass

Every chrome surface (header, menu, buttons, footer, cards) uses a
**glassmorphism** treatment defined in `src/app/globals.css`:

- `.glass` / `.glass-strong` — translucent white-over-black panels with
  `backdrop-filter: blur(...)` and a soft inner highlight, for the frosted
  look.
- `.glow-sm` / `.glow-md` / `.glow-lg` / `.glow-text` — soft white bloom/halo,
  the "brightening" effect, used on hover and active states.
- Text is white/near-white throughout. The only non-monochrome colors are two
  small **functional** accents: `--color-hot` (HOT badges, legal-page
  warnings) and `--color-gold` (star ratings).
- Game **thumbnails** keep their per-category color gradients on purpose —
  that's content, not chrome, and it's what makes genres recognizable at a
  glance. Everything around them stays black/white/glass.

## The desktop menu (exactly as specified)

`src/components/Sidebar.tsx` (desktop, ≥1024px only):

- Renders as a slim 72px icon-only rail by default.
- **Hovering** over it expands it to a 240px panel with full labels — it
  overlays the page (doesn't push content), and **moving the mouse away
  collapses it back** to the icon rail automatically.
- The **panel-left toggle button in the header** fully hides/shows the whole
  sidebar (rail included) — independent of hover. Click it once to make the
  menu disappear entirely; click again to bring the icon rail back.

Mobile/Android currently uses a separate slide-in drawer + bottom nav
(`MobileDrawer.tsx` / `MobileBottomNav.tsx`) — per your note, that behavior is
a placeholder until you specify the mobile-specific interaction.

## Menu contents (`src/components/NavList.tsx`)

- **Discover:** Home, Popular Games, Latest Games, Leaderboard, Updated
- **Genres (18):** Multiplayer, Action, Adventure,
  Arcade, Brain, Driving, .io Games, Shooting Games, Puzzle Games, Simulation,
  Sports, Strategy, Trivia, Word, Casual, Board, Card, Clicker (the last 6
  added for the mobile home page spec)
- **Pages:** About Us, Contact Us, Privacy Policy, Disclaimer, Terms and
  Conditions, Kids Message, Parents Info
- **Social icons:** Facebook / Instagram / X / YouTube (placeholder `href="#"`
  links — lucide-react no longer ships brand logos, so these are simple
  original line-icon glyphs in `SocialIcons.tsx`, not official brand assets)
- **Copyright line** at the bottom

All of the above appears in both the desktop hover-menu and the mobile
drawer. The Pages/Social/Copyright block is hidden while the desktop sidebar
is collapsed to its icon rail (not enough room) and reappears on hover.

## Pages added this round

- `/leaderboard` — full ranked list of games by play count
- `/about`, `/contact`, `/privacy-policy`, `/disclaimer`, `/terms`,
  `/kids-message`, `/parents-info` — generic starter content

**Important:** Privacy Policy, Disclaimer, and Terms and Conditions are
placeholder templates, not legal advice. Given the Kids Message / Parents
Info pages, this site likely needs child-directed-site compliance (COPPA in
the US, GDPR-K in the EU/UK, etc.) — have a lawyer review and finalize all
three legal pages, especially the children's-privacy section, before launch.

## Project structure

```
src/
  app/
    page.tsx                      home
    category/[slug]/page.tsx      genre grid
    game/[slug]/page.tsx          game detail + placeholder player
    leaderboard/page.tsx
    about|contact|privacy-policy|disclaimer|terms|kids-message|parents-info/
    globals.css                   theme tokens + glass/glow utilities
  components/
    AppShell.tsx                  owns sidebarHidden + drawerOpen state
    Header.tsx                    logo, search, mobile hamburger, desktop sidebar toggle
    Sidebar.tsx                   hover-expand desktop menu
    MobileDrawer.tsx / MobileBottomNav.tsx
    NavList.tsx                   Discover + Genres + Pages + social + copyright
    HeroCarousel.tsx / CategoryRow.tsx / GameCard.tsx / GameThumbnail.tsx
    SearchBox.tsx                 client-side instant search
    PlayFrame.tsx                 placeholder "player" on the game page
    StaticPage.tsx                shared layout for About/Privacy/Terms/etc
    SocialIcons.tsx                original Facebook/Instagram/X/YouTube glyphs
  lib/
    categories.ts                 the 18 genres: icon, accent gradient, word bank
    games.ts                      procedural generator + helper queries
    prng.ts / types.ts / icon-map.ts
```

## Resizing the catalog

`GAMES_PER_CATEGORY` in `games.ts` controls games-per-genre (currently 10 ×
18 genres = 180 games). Add/remove genres in `categories.ts`.

## Thumbnails & real game embeds

Same as before — see `GameThumbnail.tsx` (generated gradient + icon tiles,
no external image requests) and `PlayFrame.tsx` (clearly marked spot to drop
in a real `<iframe>` / canvas embed on the game page).

## Renaming the brand

"MofiGames" lives in `components/Logo.tsx` and `app/layout.tsx` metadata.
