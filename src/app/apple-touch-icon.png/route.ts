import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSiteIdentity } from "@/lib/site-identity";

/**
 * Serves /apple-touch-icon.png dynamically, same reasoning as
 * src/app/favicon.ico/route.ts: iOS/iPadOS Safari requests this exact
 * path at the origin root on its own — as its built-in fallback for "Add
 * to Home Screen" — independent of the `<link rel="apple-touch-icon">`
 * tag in <head>. A static file here would always win that race over
 * whatever an admin uploads through Site Identity, so this route is the
 * single source of truth instead, proxied (not redirected) for the same
 * no-flash reason as the favicon route.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const identity = await getSiteIdentity();

  if (identity.appleTouchIconUrl) {
    try {
      const upstream = await fetch(identity.appleTouchIconUrl, { cache: "no-store" });
      if (upstream.ok) {
        const bytes = await upstream.arrayBuffer();
        return new NextResponse(bytes, {
          headers: {
            "Content-Type": upstream.headers.get("content-type") || "image/png",
            "Cache-Control": "public, max-age=600, must-revalidate",
          },
        });
      }
    } catch {
      // Upstream fetch failed — fall through to the bundled default.
    }
  }

  const bytes = await readFile(path.join(process.cwd(), "public", "default-apple-touch-icon.png"));
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=600, must-revalidate",
    },
  });
}
