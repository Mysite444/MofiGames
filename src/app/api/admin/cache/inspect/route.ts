import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { getCacheSettingsServer } from "@/lib/cache-settings-server";

// Admin → Cache → Browser Cache → "Live header check". Makes real
// requests — to this app's own origin and to Supabase Storage — and
// reports back exactly what Cache-Control/ETag/Last-Modified/Expires
// each one actually sent, instead of asking the admin to trust that the
// config is doing what it says. Every check is independent and fails
// soft (a broken/unreachable target becomes one "fail" row, not a 500
// for the whole page).

const FETCH_TIMEOUT_MS = 6000;

type Verdict = "pass" | "warn" | "fail";

interface HeaderSnapshot {
  cacheControl: string | null;
  etag: string | null;
  lastModified: string | null;
  expires: string | null;
  /** Vercel CDN cache status. Values: HIT | MISS | STALE | BYPASS | REVALIDATED.
   *  Only present when the response was served by Vercel's edge network.
   *  MISS on the first request after revalidatePath is expected and correct;
   *  HIT on the second request confirms CDN caching is working. */
  xVercelCache: string | null;
  /** Set by applySecurityCacheHeaders() in middleware.ts.
   *  Values: cacheable | cacheable:vary-cookie | bypass:<reason> | signed-valid | signed-invalid.
   *  "cacheable" means middleware did not add no-store — CDN is free to cache.
   *  "bypass:*" means middleware actively prevented CDN caching for that route. */
  xCacheSecurity: string | null;
  /** Age (seconds) that the CDN has held this response. Positive value
   *  confirms the CDN is serving from its cache, not hitting the origin. */
  age: string | null;
}

interface CheckResult {
  id: string;
  label: string;
  detailUrl: string;
  category: string;
  status: number | null;
  headers: HeaderSnapshot | null;
  verdict: Verdict;
  note: string;
}

async function fetchHeaders(url: string): Promise<{ status: number; headers: HeaderSnapshot; body?: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // HEAD first (cheaper, and enough for every check except the one
    // that needs to read the homepage's HTML to find a static asset
    // URL) — fall back to GET for hosts that don't support HEAD.
    let res = await fetch(url, { method: "HEAD", cache: "no-store", signal: controller.signal });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { method: "GET", cache: "no-store", signal: controller.signal });
    }
    const snapshot: HeaderSnapshot = {
      cacheControl: res.headers.get("cache-control"),
      etag: res.headers.get("etag"),
      lastModified: res.headers.get("last-modified"),
      expires: res.headers.get("expires"),
      xVercelCache: res.headers.get("x-vercel-cache"),
      xCacheSecurity: res.headers.get("x-cache-security"),
      age: res.headers.get("age"),
    };
    return { status: res.status, headers: snapshot };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithBody(url: string): Promise<{ status: number; headers: HeaderSnapshot; body: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "GET", cache: "no-store", signal: controller.signal });
    const body = await res.text();
    return {
      status: res.status,
      headers: {
        cacheControl: res.headers.get("cache-control"),
        etag: res.headers.get("etag"),
        lastModified: res.headers.get("last-modified"),
        expires: res.headers.get("expires"),
        xVercelCache: res.headers.get("x-vercel-cache"),
        xCacheSecurity: res.headers.get("x-cache-security"),
        age: res.headers.get("age"),
      },
      body,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function hasDirective(cacheControl: string | null, directive: string): boolean {
  if (!cacheControl) return false;
  return cacheControl
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .includes(directive.toLowerCase());
}

function maxAgeOf(cacheControl: string | null): number | null {
  if (!cacheControl) return null;
  const match = cacheControl.match(/max-age=(\d+)/i);
  return match ? Number(match[1]) : null;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const origin = new URL(request.url).origin;
  const cacheSettings = await getCacheSettingsServer();
  const results: CheckResult[] = [];

  // Helper: determine if a Cache-Control value has a positive s-maxage.
  function smaxageOf(cc: string | null): number | null {
    if (!cc) return null;
    const match = cc.match(/s-maxage=(\d+)/i);
    return match ? Number(match[1]) : null;
  }

  // -----------------------------------------------------------------------
  // 1. Homepage HTML — also mined for a real /_next/static asset URL.
  // -----------------------------------------------------------------------
  const homepage = await fetchWithBody(`${origin}/`);
  if (homepage) {
    const sm = smaxageOf(homepage.headers.cacheControl);
    const cdnCaching = sm !== null && sm > 0;
    const cdnHit = homepage.headers.xVercelCache === "HIT";
    results.push({
      id: "html_page",
      label: "Homepage (HTML page)",
      detailUrl: `${origin}/`,
      category: "html_page",
      status: homepage.status,
      headers: homepage.headers,
      verdict: cdnCaching ? (homepage.headers.etag ? "pass" : "warn") : "warn",
      note: [
        cdnCaching
          ? `s-maxage=${sm}s — CDN is instructed to cache the homepage.`
          : "No s-maxage in Cache-Control. CDN will not cache the HTML. Run the app after Phase 6A–6E deploy to see the correct value.",
        cdnHit ? "X-Vercel-Cache: HIT — CDN served this response without hitting the origin." : `X-Vercel-Cache: ${homepage.headers.xVercelCache ?? "absent"} — ${homepage.headers.xVercelCache === "MISS" ? "first request after revalidation (expected)" : "CDN not yet caching"}.`,
        homepage.headers.xCacheSecurity
          ? `X-Cache-Security: ${homepage.headers.xCacheSecurity}`
          : "X-Cache-Security header absent (middleware may not have run).",
      ].join(" | "),
    });

    // 1b. Hashed static asset extracted from the homepage HTML.
    const assetMatch = homepage.body.match(/\/_next\/static\/[^"'\s)]+\.(?:js|css)/);
    if (assetMatch) {
      const assetUrl = `${origin}${assetMatch[0]}`;
      const asset = await fetchHeaders(assetUrl);
      if (asset) {
        const immutable = hasDirective(asset.headers.cacheControl, "immutable");
        const longLived = (maxAgeOf(asset.headers.cacheControl) ?? 0) >= 31536000;
        results.push({
          id: "static_asset",
          label: "Build asset (/_next/static)",
          detailUrl: assetUrl,
          category: "static_asset",
          status: asset.status,
          headers: asset.headers,
          verdict: immutable && longLived ? "pass" : "warn",
          note:
            immutable && longLived
              ? "public, max-age=31536000, immutable — enforced by Next.js itself, not overridable."
              : "Expected immutable, one-year Cache-Control on hashed build output. Usually means a proxy/CDN is rewriting it.",
        });
      }
    }
  } else {
    results.push({
      id: "html_page",
      label: "Homepage (HTML page)",
      detailUrl: `${origin}/`,
      category: "html_page",
      status: null,
      headers: null,
      verdict: "fail",
      note: "Could not reach the homepage from the server.",
    });
  }

  // -----------------------------------------------------------------------
  // 2. Game page ISR check — the critical Phase 6A validation.
  //    Fetches the most-recently-updated published game's slug page and
  //    confirms it has s-maxage and (on a second request) X-Vercel-Cache: HIT.
  // -----------------------------------------------------------------------
  const { data: sampleGameForIsr } = await supabase
    .from("games")
    .select("slug, title")
    .eq("is_published", true)
    .neq("visibility", "private")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sampleGameForIsr?.slug) {
    const gamePageUrl = `${origin}/${sampleGameForIsr.slug}`;
    const gamePage = await fetchHeaders(gamePageUrl);
    if (gamePage) {
      const sm = smaxageOf(gamePage.headers.cacheControl);
      const isIsr = sm !== null && sm > 0;
      const cdnHit = gamePage.headers.xVercelCache === "HIT";
      const cdnStale = gamePage.headers.xVercelCache === "STALE";
      const isCacheable = gamePage.headers.xCacheSecurity === "cacheable";
      results.push({
        id: "game_page_isr",
        label: `Game page ISR: /${sampleGameForIsr.slug}`,
        detailUrl: gamePageUrl,
        category: "html_page",
        status: gamePage.status,
        headers: gamePage.headers,
        verdict: isIsr && isCacheable ? "pass" : isIsr || isCacheable ? "warn" : "fail",
        note: [
          isIsr
            ? `s-maxage=${sm}s — ISR is active. CDN will cache this page.`
            : "No s-maxage — page is NOT being ISR-cached by the CDN. This means cookies() is still being called in the render path. Verify Phase 6A was deployed correctly.",
          cdnHit
            ? "X-Vercel-Cache: HIT — CDN served from edge cache (no origin hit)."
            : cdnStale
              ? "X-Vercel-Cache: STALE — CDN served stale while revalidating (correct behaviour)."
              : `X-Vercel-Cache: ${gamePage.headers.xVercelCache ?? "absent"} — first visit or cache recently busted.`,
          isCacheable
            ? "X-Cache-Security: cacheable — middleware did not add no-store."
            : `X-Cache-Security: ${gamePage.headers.xCacheSecurity ?? "absent"} — middleware may be blocking CDN caching.`,
          gamePage.headers.age ? `Age: ${gamePage.headers.age}s (time CDN has held this response).` : "",
        ].filter(Boolean).join(" | "),
      });
    }
  }

  // -----------------------------------------------------------------------
  // 3. Navigation fragment — Phase 6D validation.
  //    Should have Cache-Control: public, s-maxage=30 (not no-store).
  // -----------------------------------------------------------------------
  const navFragmentUrl = `${origin}/api/fragments/navigation`;
  const navFragment = await fetchHeaders(navFragmentUrl);
  if (navFragment) {
    const sm = smaxageOf(navFragment.headers.cacheControl);
    const isPublic = hasDirective(navFragment.headers.cacheControl, "public");
    const cdnHit = navFragment.headers.xVercelCache === "HIT";
    const noStore = hasDirective(navFragment.headers.cacheControl, "no-store");
    results.push({
      id: "nav_fragment",
      label: "Navigation fragment API (/api/fragments/navigation)",
      detailUrl: navFragmentUrl,
      category: "api_public",
      status: navFragment.status,
      headers: navFragment.headers,
      verdict: isPublic && sm !== null && !noStore ? "pass" : "fail",
      note: noStore
        ? "Cache-Control: no-store — the fragment is NOT being CDN-cached. This means the /api/fragments/navigation override in next.config.ts headers() is not active. Every page load fires a live Vercel Function. Verify Phase 6D was deployed."
        : isPublic && sm !== null
          ? `public, s-maxage=${sm}s — CDN will cache this response. ${cdnHit ? "X-Vercel-Cache: HIT ✓" : `X-Vercel-Cache: ${navFragment.headers.xVercelCache ?? "MISS"} (cache warming).`}`
          : `Unexpected Cache-Control: ${navFragment.headers.cacheControl ?? "absent"}.`,
    });
  }

  // -----------------------------------------------------------------------
  // 4. Categories page ISR check — Phase 6B validation.
  // -----------------------------------------------------------------------
  const categoriesPage = await fetchHeaders(`${origin}/categories`);
  if (categoriesPage) {
    const sm = smaxageOf(categoriesPage.headers.cacheControl);
    const isIsr = sm !== null && sm > 0;
    results.push({
      id: "categories_page_isr",
      label: "Categories page ISR (/categories)",
      detailUrl: `${origin}/categories`,
      category: "html_page",
      status: categoriesPage.status,
      headers: categoriesPage.headers,
      verdict: isIsr ? "pass" : "fail",
      note: isIsr
        ? `s-maxage=${sm}s — ISR active. X-Vercel-Cache: ${categoriesPage.headers.xVercelCache ?? "absent"}.`
        : "No s-maxage — /categories is not ISR-cached. Verify Phase 6B (export const revalidate = 300) was deployed.",
    });
  }

  // -----------------------------------------------------------------------
  // 5. Blog index ISR check — Phase 6C validation.
  // -----------------------------------------------------------------------
  const blogPage = await fetchHeaders(`${origin}/blog`);
  if (blogPage) {
    const sm = smaxageOf(blogPage.headers.cacheControl);
    const isIsr = sm !== null && sm > 0;
    results.push({
      id: "blog_page_isr",
      label: "Blog index ISR (/blog)",
      detailUrl: `${origin}/blog`,
      category: "html_page",
      status: blogPage.status,
      headers: blogPage.headers,
      verdict: isIsr ? "pass" : "fail",
      note: isIsr
        ? `s-maxage=${sm}s — ISR active. X-Vercel-Cache: ${blogPage.headers.xVercelCache ?? "absent"}.`
        : "No s-maxage — /blog is not ISR-cached. Verify Phase 6C (export const revalidate = 300) was deployed.",
    });
  }

  // -----------------------------------------------------------------------
  // 6. favicon.ico
  // -----------------------------------------------------------------------
  const favicon = await fetchHeaders(`${origin}/favicon.ico`);
  if (favicon) {
    results.push({
      id: "favicon",
      label: "favicon.ico",
      detailUrl: `${origin}/favicon.ico`,
      category: "favicon",
      status: favicon.status,
      headers: favicon.headers,
      verdict: hasDirective(favicon.headers.cacheControl, "must-revalidate") ? "pass" : "warn",
      note: "Proxied from Site Identity's uploaded favicon with a short, revalidating cache so a new upload shows up quickly.",
    });
  }

  // -----------------------------------------------------------------------
  // 7. apple-touch-icon.png
  // -----------------------------------------------------------------------
  const appleTouchIcon = await fetchHeaders(`${origin}/apple-touch-icon.png`);
  if (appleTouchIcon) {
    results.push({
      id: "apple_touch_icon",
      label: "apple-touch-icon.png",
      detailUrl: `${origin}/apple-touch-icon.png`,
      category: "favicon",
      status: appleTouchIcon.status,
      headers: appleTouchIcon.headers,
      verdict: hasDirective(appleTouchIcon.headers.cacheControl, "must-revalidate") ? "pass" : "warn",
      note: "Proxied from Site Identity's uploaded Apple touch icon with a short, revalidating cache so a new upload shows up quickly.",
    });
  }

  // -----------------------------------------------------------------------
  // 8. robots.txt
  // -----------------------------------------------------------------------
  const robots = await fetchHeaders(`${origin}/robots.txt`);
  if (robots) {
    results.push({
      id: "robots",
      label: "robots.txt",
      detailUrl: `${origin}/robots.txt`,
      category: "robots",
      status: robots.status,
      headers: robots.headers,
      verdict: robots.headers.cacheControl ? "pass" : "warn",
      note: "Cached for an hour with a day of stale-while-revalidate.",
    });
  }

  // -----------------------------------------------------------------------
  // 9. Game thumbnail (Vercel Blob)
  // -----------------------------------------------------------------------
  const { data: sampleGame } = await supabase
    .from("games")
    .select("thumbnail_url")
    .not("thumbnail_url", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sampleGame?.thumbnail_url) {
    const thumb = await fetchHeaders(sampleGame.thumbnail_url);
    if (thumb) {
      const configuredMaxAge = cacheSettings.gameThumbnailsMaxAge;
      const actualMaxAge = maxAgeOf(thumb.headers.cacheControl);
      results.push({
        id: "game_thumbnail",
        label: "Sample game thumbnail (Vercel Blob)",
        detailUrl: sampleGame.thumbnail_url,
        category: "media_versioned",
        status: thumb.status,
        headers: thumb.headers,
        verdict: thumb.headers.etag && actualMaxAge !== null ? "pass" : "warn",
        note:
          thumb.headers.etag && actualMaxAge !== null
            ? `ETag + Last-Modified come from Vercel Blob automatically. max-age=${actualMaxAge}s, configured ceiling ${configuredMaxAge}s.`
            : "Missing ETag or Cache-Control — check the game-thumbnails path's cacheControlMaxAge in /api/admin/blob/upload.",
      });
    }
  }

  // -----------------------------------------------------------------------
  // 10. Media Library asset
  // -----------------------------------------------------------------------
  const { data: sampleAsset } = await supabase
    .from("media_assets")
    .select("url, category")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sampleAsset?.url) {
    const asset = await fetchHeaders(sampleAsset.url);
    if (asset) {
      results.push({
        id: "media_library",
        label: `Sample media library asset (${sampleAsset.category})`,
        detailUrl: sampleAsset.url,
        category: "media_versioned",
        status: asset.status,
        headers: asset.headers,
        verdict: asset.headers.etag ? "pass" : "warn",
        note: `Configured ceiling ${cacheSettings.mediaLibraryMaxAge}s. Path is stamped with the upload time, so a long cache never serves a stale replacement.`,
      });
    }
  }

  // -----------------------------------------------------------------------
  // 11. Service worker — must NOT be long-cached.
  // -----------------------------------------------------------------------
  const sw = await fetchHeaders(`${origin}/sw.js`);
  if (sw) {
    const noCache = hasDirective(sw.headers.cacheControl, "no-cache") || hasDirective(sw.headers.cacheControl, "no-store");
    results.push({
      id: "service_worker",
      label: "/sw.js",
      detailUrl: `${origin}/sw.js`,
      category: "service_worker",
      status: sw.status,
      headers: sw.headers,
      verdict: noCache ? "pass" : "fail",
      note: noCache
        ? cacheSettings.serviceWorkerEnabled
          ? `Serving the caching worker, version ${cacheSettings.serviceWorkerCacheVersion}.`
          : "Service worker is turned off — serving a self-unregistering stub so old installs clean themselves up."
        : "A service worker file must never be cached — a long-lived Cache-Control here means visitors can get stuck on an old version indefinitely.",
    });
  }

  return NextResponse.json({ checks: results, checkedAt: new Date().toISOString() });
}
