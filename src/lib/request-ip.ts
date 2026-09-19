import type { NextRequest } from "next/server";
import { headers } from "next/headers";

/** Best-effort client IP from standard proxy headers (Vercel, most CDNs).
 * Returns null when nothing usable is present — callers should treat
 * that as "can't determine IP" and fail open, not as a distinct value to
 * rate-limit/block on. */
export function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip");
}

/** Vercel country header for Server Components / layouts / pages,
 * where there's no NextRequest to read — uses next/headers instead.
 * Returns null on other hosts and in local dev; callers should fail open. */
export async function clientCountryFromHeaders(): Promise<string | null> {
  const h = await headers();
  return h.get("x-vercel-ip-country");
}

/** Two-letter country code -> display name ("PK" -> "Pakistan"), via the
 * runtime's built-in locale data rather than a hand-maintained table.
 * Returns null for anything it doesn't recognize (including null/empty
 * input) so callers can fall back to country-less copy. */
export function countryNameFromCode(code: string | null): string | null {
  if (!code) return null;
  try {
    const name = new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase());
    // Intl.DisplayNames doesn't throw for well-formed-but-unassigned codes —
    // it either echoes the code back or returns the literal "Unknown
    // Region". Either means it wasn't a real, recognized country.
    if (!name || name === code.toUpperCase() || name === "Unknown Region") return null;
    return name;
  } catch {
    return null;
  }
}
