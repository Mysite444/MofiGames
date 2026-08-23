import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSiteIdentity } from "@/lib/site-identity";

/**
 * Serves /favicon.ico dynamically instead of as a static file.
 *
 * Why this exists: browsers request /favicon.ico directly at the origin
 * root as their own built-in fallback, independent of whatever <link
 * rel="icon"> tags are in <head> — and a static src/app/favicon.ico file
 * gets auto-tagged by Next.js regardless of what generateMetadata()
 * returns. That meant an admin-uploaded favicon (Admin → Site Settings →
 * Site Identity) could lose the race to the old static file: two
 * competing icon sources for the same browser feature, with no reliable
 * way to guarantee which one won. Making /favicon.ico itself dynamic
 * removes the competition entirely — there is exactly one source of
 * truth, and it's always current.
 *
 * This proxies the custom favicon's bytes (fetches it server-side and
 * returns them directly) rather than redirecting the browser to the
 * external Supabase URL. A redirect meant the browser briefly showed
 * *something* — the old cached icon, or nothing — while it followed a
 * second hop to a different URL, which is what caused the visible
 * old-icon-then-new-icon flash. Proxying collapses that to one response
 * from one URL, matching what the <link> tag in layout.tsx also points
 * to, so there's nothing left to race against.
 */

// Must resolve fresh per request — an admin swapping the favicon needs to
// show up immediately, not after the next deploy.
export const dynamic = "force-dynamic";

export async function GET() {
  const identity = await getSiteIdentity();

  if (identity.faviconUrl) {
    try {
      const upstream = await fetch(identity.faviconUrl, { cache: "no-store" });
      if (upstream.ok) {
        const bytes = await upstream.arrayBuffer();
        return new NextResponse(bytes, {
          headers: {
            "Content-Type": upstream.headers.get("content-type") || "image/png",
            // The <link> tag's URL is versioned with ?v=<updated_at> (see
            // layout.tsx), so it's safe to cache this fairly aggressively —
            // any real change produces a new URL. This shorter window just
            // covers the browser's own un-versioned /favicon.ico probe.
            "Cache-Control": "public, max-age=600, must-revalidate",
          },
        });
      }
    } catch {
      // Upstream fetch failed (network blip, asset deleted, etc.) — fall
      // through to the bundled default rather than showing a broken icon.
    }
  }

  // No custom favicon set (or the fetch above failed) — serve the bundled
  // brand-default icon.
  const bytes = await readFile(path.join(process.cwd(), "public", "default-favicon.ico"));
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/x-icon",
      "Cache-Control": "public, max-age=600, must-revalidate",
    },
  });
}
