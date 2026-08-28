import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import type { FullPageCacheProvider } from "@/lib/full-page-cache-settings";

// Admin → Cache → Full Page Cache → "Detect Active Cache".
// Makes a real GET request to the site's own homepage (from the server side,
// so it goes through whatever reverse proxy / cache is in front of the app)
// and inspects the response headers to infer which full-page cache provider,
// if any, is active.
//
// Header signals:
//   X-LiteSpeed-Cache: hit/miss     → LiteSpeed
//   X-Varnish: <vxid>               → Varnish
//   Age: <seconds>                  → any HTTP cache (Varnish / Nginx / CDN)
//   X-Cache: HIT|MISS               → Nginx proxy_cache, some CDNs
//   X-Cache-Status: HIT|MISS        → Nginx fastcgi_cache
//   Cf-Cache-Status: HIT|MISS|…     → Cloudflare CDN / APO
//   X-Nginx-Cache: hit              → Nginx (alternative header)
//   Server: LiteSpeed               → LiteSpeed server itself
//   Server: nginx                   → Nginx server itself
//   Via: …varnish…                  → Varnish (or upstream Varnish)
//
// The probe hits the homepage twice in quick succession. If the second
// request gets an Age > 0 or a HIT status, the cache is serving.

const FETCH_TIMEOUT_MS = 8000;

interface HeaderSnapshot {
  [key: string]: string | null;
}

interface ProbeResult {
  url: string;
  status: number | null;
  headers: HeaderSnapshot;
  durationMs: number;
}

async function probe(url: string): Promise<ProbeResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      // Pass a recognisable UA so this probe doesn't skew analytics
      headers: { "User-Agent": "mofigames-cache-detector/1.0 (admin health check)" },
      signal: controller.signal,
    });
    return {
      url,
      status: res.status,
      headers: {
        "cache-control": res.headers.get("cache-control"),
        "x-litespeed-cache": res.headers.get("x-litespeed-cache"),
        "x-cache": res.headers.get("x-cache"),
        "x-cache-status": res.headers.get("x-cache-status"),
        "x-nginx-cache": res.headers.get("x-nginx-cache"),
        "x-fastcgi-cache": res.headers.get("x-fastcgi-cache"),
        "cf-cache-status": res.headers.get("cf-cache-status"),
        "x-varnish": res.headers.get("x-varnish"),
        via: res.headers.get("via"),
        age: res.headers.get("age"),
        server: res.headers.get("server"),
        "x-powered-by": res.headers.get("x-powered-by"),
      },
      durationMs: Date.now() - start,
    };
  } catch {
    return {
      url,
      status: null,
      headers: {},
      durationMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function detectProvider(second: ProbeResult): {
  provider: FullPageCacheProvider;
  cacheStatus: "hit" | "miss" | "unknown";
  signals: string[];
} {
  const h = second.headers;
  const signals: string[] = [];
  let provider: FullPageCacheProvider = "none";
  let cacheStatus: "hit" | "miss" | "unknown" = "unknown";

  // LiteSpeed — always sets X-LiteSpeed-Cache when the LS cache module is
  // active, even on a MISS, so we can detect it before the first hit.
  if (h["x-litespeed-cache"]) {
    provider = "litespeed";
    const val = h["x-litespeed-cache"]?.toLowerCase() ?? "";
    cacheStatus = val === "hit" ? "hit" : val === "miss" ? "miss" : "unknown";
    signals.push(`X-LiteSpeed-Cache: ${h["x-litespeed-cache"]}`);
  }

  // Varnish — X-Varnish is set by Varnish itself; Via usually contains "varnish"
  if (h["x-varnish"]) {
    provider = "varnish";
    signals.push(`X-Varnish: ${h["x-varnish"]}`);
    const age = Number(h["age"] ?? -1);
    if (age > 0) cacheStatus = "hit";
  }
  if (h["via"]?.toLowerCase().includes("varnish")) {
    provider = "varnish";
    signals.push(`Via: ${h["via"]}`);
  }

  // Nginx FastCGI / proxy_cache
  if (h["x-cache-status"]) {
    if (provider === "none") provider = "nginx_fastcgi";
    const val = h["x-cache-status"]?.toUpperCase() ?? "";
    cacheStatus = val === "HIT" ? "hit" : val.startsWith("MISS") ? "miss" : "unknown";
    signals.push(`X-Cache-Status: ${h["x-cache-status"]}`);
  }
  if (h["x-fastcgi-cache"]) {
    if (provider === "none") provider = "nginx_fastcgi";
    const val = h["x-fastcgi-cache"]?.toUpperCase() ?? "";
    cacheStatus = val === "HIT" ? "hit" : val.startsWith("MISS") ? "miss" : "unknown";
    signals.push(`X-FastCGI-Cache: ${h["x-fastcgi-cache"]}`);
  }
  if (h["x-cache"]) {
    if (provider === "none") provider = "nginx_fastcgi";
    const val = h["x-cache"]?.toUpperCase() ?? "";
    if (val.startsWith("HIT")) cacheStatus = "hit";
    else if (val.startsWith("MISS")) cacheStatus = "miss";
    signals.push(`X-Cache: ${h["x-cache"]}`);
  }

  // Cloudflare APO — Cf-Cache-Status header is always present on Cloudflare zones
  if (h["cf-cache-status"]) {
    if (provider === "none") provider = "cloudflare_apo";
    const val = h["cf-cache-status"]?.toUpperCase() ?? "";
    cacheStatus = val === "HIT" ? "hit" : val === "MISS" || val === "EXPIRED" ? "miss" : "unknown";
    signals.push(`Cf-Cache-Status: ${h["cf-cache-status"]}`);
  }

  // Server header as secondary signal
  const srv = h["server"]?.toLowerCase() ?? "";
  if (srv.includes("litespeed") && provider === "none") {
    provider = "litespeed";
    signals.push(`Server: ${h["server"]}`);
  }
  if (srv.includes("nginx") && provider === "none") {
    provider = "nginx_fastcgi";
    signals.push(`Server: ${h["server"]}`);
  }

  // Age as a generic "something is cached" signal
  const age = Number(h["age"] ?? -1);
  if (age > 0 && cacheStatus === "unknown") {
    cacheStatus = "hit";
    signals.push(`Age: ${h["age"]}s`);
  }

  return { provider, cacheStatus, signals };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const origin = new URL(request.url).origin;
  const targetUrl = `${origin}/`;

  // Two probes: the first populates the cache if empty; the second should
  // return a HIT (or an Age header) if any full-page cache is active.
  const first = await probe(targetUrl);
  const second = await probe(targetUrl);

  const detection = detectProvider(second);

  return NextResponse.json({
    detectedAt: new Date().toISOString(),
    probes: [
      { label: "First request (warm-up)", ...first },
      { label: "Second request (cache check)", ...second },
    ],
    detected: detection,
  });
}
