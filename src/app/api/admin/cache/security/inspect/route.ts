import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";

/** GET /api/admin/cache/security/inspect?path=/ — Admin → Cache →
 * Security → "Live header check". Makes two real requests to this app's
 * own origin for the given path — one with no cookies (guest), one
 * carrying a fake auth cookie — and reports back exactly what
 * Cache-Control / Vary / X-Cache-Security headers applySecurityCacheHeaders()
 * in middleware.ts actually sent for each, instead of asking the admin to
 * trust the settings screen. Same "make a real request and read the real
 * headers" approach as Full Page Cache's /detect and Browser Cache's
 * /inspect. The fake cookie's value is a harmless placeholder — middleware
 * only ever checks cookie *names* for this feature, never values, so it
 * doesn't need to be (and isn't) a real session token. */

const FETCH_TIMEOUT_MS = 8000;
const PROBE_AUTH_COOKIE_NAME = "sb-access-token";

interface HeaderSnapshot {
  cacheControl: string | null;
  vary: string | null;
  xCacheSecurity: string | null;
}

interface ProbeResult {
  label: string;
  status: number | null;
  headers: HeaderSnapshot | null;
  error?: string;
}

async function probe(url: string, cookieHeader?: string): Promise<Omit<ProbeResult, "label">> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      redirect: "manual",
      headers: {
        "User-Agent": "mofigames-security-cache-inspector/1.0 (admin health check)",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      signal: controller.signal,
    });
    return {
      status: res.status,
      headers: {
        cacheControl: res.headers.get("cache-control"),
        vary: res.headers.get("vary"),
        xCacheSecurity: res.headers.get("x-cache-security"),
      },
    };
  } catch {
    return { status: null, headers: null, error: "Could not reach this path from the server." };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const rawPath = new URL(request.url).searchParams.get("path") ?? "/";
  const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  const origin = new URL(request.url).origin;
  const targetUrl = `${origin}${path}`;

  const [guest, authenticated] = await Promise.all([
    probe(targetUrl),
    probe(targetUrl, `${PROBE_AUTH_COOKIE_NAME}=inspector-probe`),
  ]);

  const results: ProbeResult[] = [
    { label: "Guest (no cookies)", ...guest },
    { label: `Authenticated (fake ${PROBE_AUTH_COOKIE_NAME} cookie)`, ...authenticated },
  ];

  return NextResponse.json({ path, checkedAt: new Date().toISOString(), results });
}
