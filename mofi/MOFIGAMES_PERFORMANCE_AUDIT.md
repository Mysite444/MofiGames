# MofiGames Homepage TTFB Audit — Root Cause & Fixes

**Scope:** `https://mofigames.com/` (homepage only)
**Reported before state:** TTFB 3.07s · FCP 3.41s · LCP 4.37s · TBT 606ms · CLS 0 · ~489KB page weight
**Method:** static code audit of the uploaded project (no live access to your Vercel/Supabase deployment from this environment — see "What I could not do" at the end)

---

## 1. Root cause

The homepage is fully dynamic and was doing **~15 separate Supabase round trips per request, almost all of them sequential, most of them for data that's identical for every visitor.** Page weight (489KB) and JS/image optimization were never the problem — that's not where the 3 seconds was going.

Two places compound:

**A. Middleware (`src/middleware.ts`) ran 5 sequential Supabase calls before Next.js even started rendering:**

| # | Call | Per-request before | Varies per visitor? |
|---|---|---|---|
| 1 | `applyAccessControl` → `check_access` RPC | every request | No — same rule set for everyone |
| 2 | `applyRedirect` → `seo_redirects` lookup | every request | No — same table for everyone |
| 3 | `supabase.auth.getUser()` | every request | **Yes** — must stay live |
| 4 | `applyDnsPrefetchControlHeader` → `dns_prefetch_settings` | every request | No |
| 5 | `applySecurityCacheHeaders` → `get_security_cache_policy` RPC | every request | No |

Four of those five calls (#1, #2, #4, #5) fetch the *same admin-configured config* for every single visitor, yet were being re-fetched from Supabase, live, on every request, with zero caching.

**B. The homepage + root layout then ran 10 more sequential/uncached reads:**
- `page.tsx`: `getAllRealGames`, `getAllRealCategories`, `getSiteIdentity`, `clientCountryFromHeaders`, `getHomepageSectionOverrides`, `getHomepageSectionPinnedGameIds` — six independent `await`s, one after another, no `Promise.all`. Then `featured`/`trending` fragments, also sequential.
- `layout.tsx` (wraps every page, including `/`): `getSeoSettings()` then `getAdSettings()` — sequential, and `getAdSettings()` was read a *second* time, independently, by `AdsenseScript`.
- Five sibling Server Components rendered by the layout (`DnsPrefetchHints`, `ResourceHints`, `SpeculationRules`'s dependency, `AnalyticsScripts`, `AdsenseScript`) each ran their own **completely uncached** Supabase read.

`getSiteIdentity()` and `getSeoSettings()` had no caching at all, despite the app already having a full Fragment Cache system (`src/lib/fragment-cache.ts`) used elsewhere for games/categories/homepage sections.

## 2. Evidence

- `src/middleware.ts` (before fix): `applyAccessControl`, `applyRedirect`, `applyDnsPrefetchControlHeader`, `applySecurityCacheHeaders` each did a bare `fetch()` to Supabase's REST/RPC endpoint with `cache: "no-store"` and no caching layer — confirmed by reading the function bodies directly.
- `src/app/page.tsx` (before fix): six `const x = await fn()` statements in a row, none independent-but-parallel.
- `src/lib/site-identity.ts` / `src/lib/seo-settings.ts` (before fix): `try { supabase.from(...).select(...) }` with no `getOrSetFragment` wrapper, unlike every other data loader in `games-server.ts` / `homepage-layout-server.ts`.
- `src/app/layout.tsx` (before fix): `const settings = await getSeoSettings(); const adSettings = await getAdSettings();` — two sequential awaits gating everything the layout renders, including the page.
- `src/lib/dns-prefetch-settings-server.ts`, `resource-hint-settings-server.ts`, `speculative-loading-settings-server.ts`, `analytics-settings.ts`, `ad-settings.ts` (before fix): each a bare, uncached `supabase.from(...)` call, invoked on every page.
- `supabase/migrations/*.sql`: `games` has separate single-column indexes on `is_published` and `visibility` (0003, 0008) but nothing covering the homepage's actual query shape, `WHERE is_published = true AND visibility = 'public' ORDER BY created_at DESC` (confirmed at `games-server.ts:230-234`) — that requires a bitmap AND of two indexes plus a separate sort step instead of one ordered index scan.
- No `preferredRegion` or `vercel.json` `"regions"` key anywhere in the project — Vercel Functions are using whatever your project's default region is, which I could not cross-check against your Supabase project's region (no dashboard access from this environment — see below).

## 3. Classification

**A (Middleware) + E (Sequential queries) + G (Missing caching)** — not a vague "it's Supabase" diagnosis. Every item above is a specific file/function with no caching or no parallelization, verified by reading the code, not assumed.

## 4. Changes made

| File | Change |
|---|---|
| `src/middleware.ts` | Added a 30s in-memory TTL cache (`SETTINGS_CACHE_TTL_MS`). Access rules and redirects now fetch the whole (small, admin-managed) table once per TTL window and evaluate the match in JS — logic verified line-for-line against `check_access()` (migration 0018) and against `seo_redirects.source_path`'s `unique` constraint (migration 0010), so behavior is identical, just not re-fetched every request. DNS-prefetch and security-cache-policy cached the same way. `supabase.auth.getUser()` is **untouched** — it must stay live. Added opt-in timing instrumentation (see §7). |
| `src/app/page.tsx` | The 6 independent reads now run via `Promise.all`; `featured`/`trending` (which depend on the games list) run as a second parallel batch. Added opt-in timing instrumentation. |
| `src/lib/site-identity.ts` | `getSiteIdentity()` wrapped in `getOrSetFragment("site-identity", ...)`, 120s TTL. |
| `src/lib/seo-settings.ts` | `getSeoSettings()` wrapped in `getOrSetFragment("seo-settings", ...)`, 120s TTL. |
| `src/lib/ad-settings.ts` | `getAdSettings()` wrapped in `getOrSetFragment("ad-settings", ...)` **and** React's `cache()` (request-level dedup — it's called twice per request, in `layout.tsx` and in `AdsenseScript`). |
| `src/lib/analytics-settings.ts` | `getAnalyticsSettings()` wrapped the same way (fragment cache + `cache()`). |
| `src/lib/dns-prefetch-settings-server.ts` | `getDnsPrefetchSettingsServer()` wrapped in `getOrSetFragment("dns-prefetch-hints", ...)`. |
| `src/lib/resource-hint-settings-server.ts` | `getResourceHintSettingsServer()` wrapped in `getOrSetFragment("resource-hints", ...)`. |
| `src/lib/speculative-loading-settings-server.ts` | `getSpeculativeLoadingSettingsServer()` wrapped in `getOrSetFragment("speculative-loading", ...)`. |
| `src/app/layout.tsx` | `RootLayout`'s own `getSeoSettings()` + `getAdSettings()` now run via `Promise.all`. |
| `src/lib/fragment-cache-settings.ts` | Registered the 7 new fragment keys above in `DEFAULT_FRAGMENTS` (all 120s TTL) so they show up in Admin → Cache → Fragment Cache like every other cached data source. |
| `src/lib/fragment-cache-invalidation.ts` | Added `invalidateSiteIdentityFragments()` and `invalidateSeoSettingsFragments()`, following the existing `invalidateFooterFragments()` pattern. |
| `src/app/api/admin/site-identity/route.ts` | Calls `invalidateSiteIdentityFragments()` on save. |
| `src/app/api/admin/seo/settings/route.ts` | Calls `invalidateSeoSettingsFragments()` on save. |
| `src/app/api/admin/ads/route.ts` | Calls `purgeFragment("ad-settings")` on save. |
| `src/app/api/admin/analytics/settings/route.ts` | Calls `purgeFragment("analytics-settings")` on save. |
| `src/app/api/dns-prefetch/settings/route.ts` | Calls `purgeFragment("dns-prefetch-hints")` on save. |
| `src/app/api/resource-hints/settings/route.ts` | Calls `purgeFragment("resource-hints")` on save. |
| `src/app/api/speculative-loading/settings/route.ts` | Calls `purgeFragment("speculative-loading")` on save. |
| `src/lib/perf-instrumentation.ts` | **New.** Opt-in `timed()` helper — no-op unless `PERF_DEBUG_TTFB=1`. See §7. |
| `supabase/migrations/0064_homepage_games_covering_index.sql` | **New.** Composite index for the homepage games query. See §5. |

**Nothing else changed.** No schema drops, no data writes, no auth/security checks removed, no URLs/SEO metadata/game functionality touched. `next build` and `tsc --noEmit` both pass clean with these changes in place.

### What's cached, for how long, and what happens after an admin saves

| Fragment | TTL | Invalidated on save? |
|---|---|---|
| `site-identity` | 120s | Yes — instant, via `PUT /api/admin/site-identity` |
| `seo-settings` | 120s | Yes — instant, via `PUT /api/admin/seo/settings` |
| `ad-settings` | 120s | Yes — instant, via `PUT /api/admin/ads` |
| `analytics-settings` | 120s | Yes — instant, via `PUT /api/admin/analytics/settings` |
| `dns-prefetch-hints` | 120s | Yes — instant, via `PUT /api/dns-prefetch/settings` |
| `resource-hints` | 120s | Yes — instant, via `PUT /api/resource-hints/settings` |
| `speculative-loading` | 120s | Yes — instant, via `PUT /api/speculative-loading/settings` |
| middleware's access rules / redirects / DNS toggle / security policy | 30s | **No** — see below |

The middleware cache is deliberately **not** wired to admin-save invalidation: middleware runs in a separate execution context from your Server Components/API routes (no shared memory to purge across), and across many warm Vercel instances there's no single place to broadcast "purge now" to all of them. Instead it uses a short, fixed 30s TTL — the same trade-off your existing `fragment-cache.ts` already makes for its own 5-second settings check. A change to an access rule, redirect, DNS-prefetch toggle, or security-cache policy takes effect within 30 seconds, on any given instance, without a redeploy. That's the one place in this change set where "immediate" became "within 30s" — everything else (site identity, SEO, ads, analytics, resource/DNS/speculative-loading hints) still reflects instantly on save.

## 5. Database changes

```sql
-- supabase/migrations/0064_homepage_games_covering_index.sql
create index if not exists games_homepage_feed_idx
  on public.games (is_published, visibility, created_at desc);
```

**Why:** `getAllRealGames()` (`src/lib/games-server.ts:230-234`) runs exactly:
```sql
select * from games
where is_published = true and visibility = 'public'
order by created_at desc
```
The existing `games_published_idx` and `games_visibility_idx` are single-column, so Postgres has to bitmap-AND two indexes and then sort separately. This composite, pre-ordered index lets it do the filter and the sort in one index scan. No other homepage query needs a different index — this is the only shape used.

**Risk:** additive only, doesn't touch existing indexes or data. On a small/medium table a plain `CREATE INDEX` (a brief exclusive lock) is fine; the migration file includes a `CREATE INDEX CONCURRENTLY` variant in a comment if your `games` table has grown large enough that a lock would be noticeable — run that by hand outside a transaction if so, since `CONCURRENTLY` can't run inside Supabase's migration transaction wrapper.

Note: because `getAllRealGames()` is already behind the `game-cards` fragment cache (300s TTL), this query only actually runs on a cold cache — but that's still every 5 minutes, plus every cold serverless instance right after a deploy, which is exactly when a real-world TTFB test is likely to catch it.

## 6. Before vs. after

```
TTFB: 3.07s → (needs your measurement — see §8)
FCP:  3.41s → (needs your measurement)
LCP:  4.37s → (needs your measurement)
TBT:  606ms → (needs your measurement)
CLS:  0     → (needs your measurement, should be unaffected — no layout changes)
```

I'm not filling these in with invented numbers. I have no network access to your live Vercel/Supabase deployment from this sandbox (egress is restricted to package registries and GitHub), so I can't run a real request against `mofigames.com` or your preview URL. What I can tell you with confidence, from the code itself:

- Middleware's critical path drops from **5 sequential Supabase round trips** to **1 mandatory one** (`auth.getUser()`) on a warm instance, plus occasional cache-refresh round trips at most once per 30s.
- The homepage's own data loading drops from **8 sequential round trips** to **2 parallel batches**.
- `site_identity` and `seo_settings` — read on literally every page — go from **always live** to **cached, refreshed at most every 120s**.

If your Supabase→Vercel round trip is costing, say, 150-250ms per call (plausible for a cross-region or even same-region-but-cold-connection scenario), removing roughly 10+ of the ~15 total round trips is the kind of change that plausibly explains most of a 3-second TTFB — but "plausibly" isn't "measured," so treat the numbers above as owed to you, not delivered.

## 7. How to actually measure it (temporary instrumentation included)

I added `src/lib/perf-instrumentation.ts` — a `timed()` helper that's a complete no-op unless you set `PERF_DEBUG_TTFB=1`. It's wired into `middleware.ts` (each of the 5 steps + a total) and `page.tsx` (both data-fetch batches + a total).

**To use it:**
1. Set `PERF_DEBUG_TTFB=1` on a **Preview** deployment (not Production).
2. Load the homepage a few times.
3. Check that deployment's Function Logs in the Vercel dashboard (or `vercel logs <url>`) — you'll see lines like:
   ```
   [perf] middleware:applyAccessControl: 4.2ms
   [perf] middleware:auth.getUser: 187.3ms
   [perf] middleware:total: 210.8ms
   [perf] homepage:batch1(games+categories+identity+country+sections+pinned): 240.1ms
   [perf] homepage:batch2(featured+trending): 3.4ms
   [perf] homepage:total data-ready: 244.0ms
   ```
4. Unset `PERF_DEBUG_TTFB` when done. The helper and its call sites can also just be deleted at any point — they only ever wrap an existing `await`, never change what's awaited or its result.

Combine that with an external TTFB measurement (`curl -w "%{time_starttransfer}\n" -o /dev/null -s https://mofigames.com/`, or re-run the same Lighthouse/PageSpeed test that produced your original report) for the full before/after picture.

## 8. Remaining bottlenecks / what I could not verify

- **Region alignment (Step 6).** I could not check your actual Supabase project region or your Vercel function region — this sandbox has no network access to the Supabase or Vercel dashboards/APIs. No `preferredRegion` or `vercel.json` region is set in the project, so Vercel is using its account/project default. **Action for you:** Supabase Dashboard → Project Settings → General → Region, and Vercel Dashboard → Project Settings → Functions → Region. If they're far apart (e.g. Supabase in `us-west-1` and Vercel defaulting to `iad1`/US East), that's real, compounding latency on every one of the round trips above, and setting `export const preferredRegion` in `layout.tsx` (or a `"regions"` array in `vercel.json`) to match Supabase's region is a low-risk, high-value fix I can help you make once you tell me what you find.
- **Actual measured before/after numbers** — see §6, needs your deployment.
- **Cold-start effects.** All of the caching above is per-instance and in-memory; a fresh serverless/edge cold start still pays for at least the first request's worth of round trips. This is a normal, expected characteristic of serverless — not something these fixes were meant to eliminate — but worth knowing if you see TTFB variance between requests.
- **The rest of the page's 606ms TBT** wasn't in scope for this pass (you explicitly asked to hold off on JS/image work) — once TTFB is fixed and re-measured, that's the next thing worth profiling if it's still high.

## 9. Storage migration note (Supabase → Vercel Blob)

You mentioned storage moved from Supabase to Vercel Blob. I checked whether this affects the homepage's TTFB: it doesn't. `src/lib/games-server.ts` already builds all game asset URLs via `blobBaseUrl()` (backed by `NEXT_PUBLIC_BLOB_BASE_URL`), and I found no remaining Supabase Storage calls anywhere in the homepage's render path — the migration is already fully reflected in the code that matters here. Nothing to change on that front for this audit.

## 10. Rollback

Every change in this pass is additive or wraps an existing function — nothing rewrites logic outside the specific functions listed in §4, and nothing touches data or schema (the index in §5 is the only DB change, and it's a pure addition).

- **Full rollback:** revert the files listed in §4 to their prior versions (if you're on git, this is a straight `git revert` of this change set) and drop the new index:
  ```sql
  drop index if exists public.games_homepage_feed_idx;
  ```
- **Partial rollback (keep some, not others):** every change is independent —
  - Don't like the middleware caching? Revert `src/middleware.ts` only; nothing else depends on it.
  - Don't like a specific fragment (e.g. ad-settings)? Remove just that `getOrSetFragment` wrapper and its `DEFAULT_FRAGMENTS` entry; the underlying function falls back to exactly its old, always-live behavior.
  - The index is independent of all the code changes and vice versa.
- **Emergency kill switch without a deploy:** every fragment cache entry (including the 7 new ones) can be individually disabled from **Admin → Cache → Fragment Cache** (the `enabled: false` toggle already built into your Fragment Cache admin UI) — this makes that specific fragment always compute live again, no code change needed.
