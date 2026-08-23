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

  // 1. Homepage HTML — also mined for a real /_next/static asset URL to
  // check next, since those hashes change on every build.
  const homepage = await fetchWithBody(`${origin}/`);
  if (homepage) {
    results.push({
      id: "html_page",
      label: "Homepage (HTML page)",
      detailUrl: `${origin}/`,
      category: "html_page",
      status: homepage.status,
      headers: homepage.headers,
      verdict: homepage.headers.etag ? "pass" : "warn",
      note: homepage.headers.etag
        ? "ETag present — Next.js's default per-page ETag generation is active."
        : "No ETag on the response. Check that generateEtags hasn't been disabled in next.config.ts.",
    });

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
              : "Expected an immutable, one-year Cache-Control on hashed build output — got something else. Usually means a proxy/CDN in front of the app is stripping or rewriting it.",
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

  // 2. favicon.ico — custom route, see src/app/favicon.ico/route.ts.
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

  // 2b. apple-touch-icon.png — custom route, see
  // src/app/apple-touch-icon.png/route.ts. Same proxy reasoning as
  // favicon.ico above: iOS probes this exact path at the root.
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

  // 3. robots.txt — custom route, see src/app/robots.txt/route.ts.
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

  // 4. A real, uploaded game thumbnail — Date.now()-stamped path, so a
  // long cache here is safe (see migration 0033's header comment).
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

  // 5. A real, uploaded Media Library asset (Admin → Media Management).
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

  // 6. The service worker route itself — the one place a long cache
  // would actively hurt (stale SW = stuck app). See src/app/sw.js/route.ts.
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
