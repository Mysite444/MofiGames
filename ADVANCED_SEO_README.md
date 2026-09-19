# Advanced SEO Module — what was built

## Setup (do this first)
1. Run `supabase/migrations/0010_advanced_seo.sql` in the Supabase SQL editor.
2. Copy `.env.example` → `.env.local`, set `NEXT_PUBLIC_SITE_URL` to your real domain.
3. Optional: set `ANTHROPIC_API_KEY` to enable the "Generate with AI" buttons.

## Game page SEO (Admin → Games → edit a game → SEO)
SEO title/description with a live Google SERP preview, canonical URL, focus + secondary keywords,
H1 override, SEO excerpt, author, full robots meta (index/follow/noarchive/nosnippet/max-snippet/
max-image-preview), Open Graph, Twitter/X card, and per-game toggles for VideoGame,
SoftwareApplication, Review, and Breadcrumb JSON-LD. "Generate with AI" drafts title/description/
keywords from the game's title + description.

## Category SEO (Admin → Categories → edit a category → SEO)
SEO title/description, canonical URL, focus keyword, H1 override, social image, index toggle,
breadcrumbs toggle, CollectionPage schema toggle. Same AI-assist button.

## Everything else → new "SEO Management" sidebar section
- **Global Settings** — site name, title template (`%title% / %category% / %site_name%`), default
  description/author/language/region, canonical domain (www vs non-www) + trailing slash rule,
  Google/Bing/Yandex/Baidu verification, Home Page SEO, social media defaults, Organization schema,
  and global indexing toggles per content type.
- **Sitemaps** — live per-type sitemaps at `/sitemaps/{games,categories,tags,blog,pages,images}.xml`,
  indexed at `/sitemap.xml`, each with an on/off switch.
- **Robots.txt** — editable at `/robots.txt`, sensible generated default if left blank.
- **Redirects** — 301/302/307/308/410 rules, applied by the middleware on every request, with hit
  counts.
- **Structured Data** — a catalog of every JSON-LD schema in use and where it's controlled, plus
  validator links.
- **SEO Analysis** — live-scored list of every published game/category/post/page, worst first.

Also extended (same pattern as Games/Categories, since they already have their own admin sections):
**Tags**, **Blog posts**, and **static Pages** all got SEO fields too, and a new `/tag/[slug]`
archive page was added so the tags sitemap has somewhere real to point.

## Technical notes
- `src/lib/seo.ts` / `seo-settings.ts` are the single source of truth every page's `generateMetadata`
  and the sitemap/robots routes pull from — no per-page reimplementation.
- Every field falls back gracefully: per-item override → auto-generated → site default.
- `npx tsc --noEmit` and `next build` both run clean against this change set.

## Deliberately out of scope (per your instructions)
Developer and Publisher pages/SEO — no such pages exist yet, next phase.
