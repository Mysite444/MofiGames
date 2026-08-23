// Run via `npm run generate:fallback`, and automatically before every
// `npm run build` (see the "prebuild" script in package.json — npm runs
// pre<script> hooks for you, no extra CI wiring needed).
//
// What this does: connects to Supabase with the same public anon key the
// site itself uses (so it only ever sees what an anonymous visitor could
// already see — nothing extra to worry about leaking into a snapshot
// that ships inside the app bundle), fetches the handful of tables that
// back every visitor-facing page (games, categories, site identity, SEO
// settings, About/Contact/nav pages), and writes them to
// src/data/fallback/*.json.
//
// Those files are what src/lib/static-fallback.ts reads at runtime when
// a live Supabase call fails and there's no warm in-memory cache entry
// to serve instead (see the resilience comments in games-server.ts,
// content-server.ts, site-identity.ts, seo-settings.ts) — the mechanism
// that keeps the site up during a Supabase outage instead of erroring.
//
// Deliberately decoupled from the rest of the app: this file does NOT
// import anything under src/lib that touches next/headers (i.e. nothing
// that transitively imports supabase/server.ts), since this script runs
// standalone via `tsx`, outside any Next.js request context that
// next/headers' cookies() needs. The two small row-mapping snippets
// below (site identity, SEO settings, pages) intentionally mirror — but
// don't import from — src/lib/site-identity.ts, src/lib/seo-settings.ts,
// and src/lib/content-server.ts for exactly that reason. If you change
// one of those tables' shape, update both places.
//
// Never throws past its own top-level catch, and never exits non-zero:
// a build must succeed even when Supabase can't be reached at build
// time (that's the whole point of this file existing) — it just leaves
// whatever snapshot already exists on disk untouched and logs why.

import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mapDbGameRow, mapDbCategoryRow, type DbGameRow, type DbCategoryRow } from "../src/lib/games-mapping";
import type { PublicPage } from "../src/lib/content-server";
import type { SiteIdentity } from "../src/lib/site-identity";
import type { SeoSettings } from "../src/lib/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FALLBACK_DIR = path.join(__dirname, "..", "src", "data", "fallback");
const FETCH_TIMEOUT_MS = 15_000;

function loadEnvLocal(): void {
  // Best-effort local-dev convenience — CI/Vercel already inject these as
  // real process.env vars, so a missing .env.local there is a non-issue,
  // not an error.
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function timeoutFetch(input: RequestInfo | URL, init?: RequestInit): ReturnType<typeof fetch> {
  return fetch(input, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

function writeJson(filename: string, data: unknown): void {
  mkdirSync(FALLBACK_DIR, { recursive: true });
  writeFileSync(path.join(FALLBACK_DIR, filename), JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function readExistingJson<T>(filename: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path.join(FALLBACK_DIR, filename), "utf-8")) as T;
  } catch {
    return fallback;
  }
}

// Mirrors site-identity.ts's mapSiteIdentityRow — see file header.
function mapSiteIdentityRowForSnapshot(row: Record<string, unknown>): Partial<SiteIdentity> {
  return {
    siteName: (row.site_name as string) ?? undefined,
    siteTagline: (row.site_tagline as string) ?? undefined,
    logoUrl: (row.logo_url as string | null) ?? null,
    faviconUrl: (row.favicon_url as string | null) ?? null,
    favicon16Url: (row.favicon_16_url as string | null) ?? null,
    favicon32Url: (row.favicon_32_url as string | null) ?? null,
    faviconSvgUrl: (row.favicon_svg_url as string | null) ?? null,
    appleTouchIconUrl: (row.apple_touch_icon_url as string | null) ?? null,
    icon192Url: (row.icon_192_url as string | null) ?? null,
    icon512Url: (row.icon_512_url as string | null) ?? null,
    copyrightText: (row.copyright_text as string) ?? undefined,
    updatedAt: (row.updated_at as string) ?? undefined,
  };
}

// Mirrors seo-settings.ts's mapSeoSettingsRow — see file header.
function mapSeoSettingsRowForSnapshot(row: Record<string, unknown>): Partial<SeoSettings> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === "id") continue;
    const camel = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    out[camel] = value;
  }
  return out as Partial<SeoSettings>;
}

// Mirrors content-server.ts's getPageBySlug row mapping — see file header.
function mapPageRowForSnapshot(row: Record<string, unknown>): PublicPage {
  return {
    id: row.id as string,
    slug: row.slug as string,
    title: row.title as string,
    content: row.content as string,
    metaDescription: (row.meta_description as string) ?? "",
    showInNav: Boolean(row.show_in_nav),
    seoTitle: (row.seo_title as string) ?? "",
    seoCanonicalUrl: (row.seo_canonical_url as string | null) ?? null,
    seoH1Title: (row.seo_h1_title as string) ?? "",
    seoIndex: (row.seo_index as boolean) ?? true,
    ogImageUrl: (row.og_image_url as string | null) ?? null,
  };
}

async function main() {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Base URL of the Vercel Blob store uploaded game builds live in — see
  // NEXT_PUBLIC_BLOB_BASE_URL in .env.example. Only affects the playUrl
  // baked into games.json for play_type: "upload" games; falls back to
  // an empty string (an unresolvable-but-harmless playUrl) rather than
  // skipping the whole snapshot refresh, since most sites' fallback
  // games are play_type: "embed" anyway.
  const gameFilesBaseUrl = process.env.NEXT_PUBLIC_BLOB_BASE_URL ?? "";
  if (!url || !anonKey) {
    console.warn(
      "[generate-static-fallback] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not set — " +
        "skipping snapshot refresh, keeping whatever is already in src/data/fallback/."
    );
    return;
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { fetch: timeoutFetch },
  });

  let hadFailure = false;

  // Games — published + public only, same filter the live site applies.
  try {
    const { data, error } = await supabase
      .from("games")
      .select("*")
      .eq("is_published", true)
      .eq("visibility", "public")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const games = (data ?? []).map((row) => mapDbGameRow(row as DbGameRow, gameFilesBaseUrl));
    writeJson("games.json", games);
    console.log(`[generate-static-fallback] games.json: ${games.length} games`);
  } catch (err) {
    hadFailure = true;
    console.error("[generate-static-fallback] Failed to snapshot games, leaving games.json unchanged:", err);
  }

  // Categories — every real (DB-backed) category, regardless of whether
  // it has games yet. The 18 built-in genre categories are static code
  // (src/lib/categories.ts) and never need a snapshot.
  try {
    const { data, error } = await supabase.from("categories").select("*");
    if (error) throw error;
    const categories = (data ?? []).map((row) => mapDbCategoryRow(row as DbCategoryRow));
    writeJson("categories.json", categories);
    console.log(`[generate-static-fallback] categories.json: ${categories.length} categories`);
  } catch (err) {
    hadFailure = true;
    console.error("[generate-static-fallback] Failed to snapshot categories, leaving categories.json unchanged:", err);
  }

  // Site identity — single row.
  try {
    const { data, error } = await supabase.from("site_identity").select("*").eq("id", true).maybeSingle();
    if (error) throw error;
    if (data) {
      writeJson("site-identity.json", mapSiteIdentityRowForSnapshot(data));
      console.log("[generate-static-fallback] site-identity.json: updated");
    } else {
      console.log("[generate-static-fallback] site-identity.json: no row in DB yet, leaving as-is");
    }
  } catch (err) {
    hadFailure = true;
    console.error("[generate-static-fallback] Failed to snapshot site identity, leaving site-identity.json unchanged:", err);
  }

  // SEO settings — single row.
  try {
    const { data, error } = await supabase.from("seo_settings").select("*").eq("id", true).maybeSingle();
    if (error) throw error;
    if (data) {
      writeJson("seo-settings.json", mapSeoSettingsRowForSnapshot(data));
      console.log("[generate-static-fallback] seo-settings.json: updated");
    } else {
      console.log("[generate-static-fallback] seo-settings.json: no row in DB yet, leaving as-is");
    }
  } catch (err) {
    hadFailure = true;
    console.error("[generate-static-fallback] Failed to snapshot SEO settings, leaving seo-settings.json unchanged:", err);
  }

  // Pages — About/Contact/every other nav-linked or directly-reachable
  // custom page. "about" and "contact" are guaranteed to end up with
  // *some* value below even if this query fails or the DB rows don't
  // exist yet — falling back to whatever was already in pages.json
  // (which itself is seeded with real copy, see the file's own commit)
  // rather than ever writing an empty entry for either.
  try {
    const { data, error } = await supabase.from("pages").select("*");
    if (error) throw error;

    const existing = readExistingJson<Record<string, PublicPage>>("pages.json", {});
    const pages: Record<string, PublicPage> = {};
    for (const row of data ?? []) {
      const mapped = mapPageRowForSnapshot(row as Record<string, unknown>);
      pages[mapped.slug] = mapped;
    }
    // Never let About/Contact silently disappear from the snapshot just
    // because this particular run didn't see a row for them.
    for (const requiredSlug of ["about", "contact"]) {
      if (!pages[requiredSlug] && existing[requiredSlug]) {
        pages[requiredSlug] = existing[requiredSlug];
      }
    }
    writeJson("pages.json", pages);
    console.log(`[generate-static-fallback] pages.json: ${Object.keys(pages).length} pages`);
  } catch (err) {
    hadFailure = true;
    console.error("[generate-static-fallback] Failed to snapshot pages, leaving pages.json unchanged:", err);
  }

  if (hadFailure) {
    console.warn(
      "[generate-static-fallback] One or more tables failed to snapshot — see errors above. " +
        "The build will continue using the last successfully generated snapshot for those files."
    );
  } else {
    console.log("[generate-static-fallback] Snapshot complete.");
  }
}

main().catch((err) => {
  // Belt and suspenders: even a bug in this script itself must never
  // fail the containing `npm run build`.
  console.error("[generate-static-fallback] Unexpected error, continuing build with existing snapshot:", err);
});
