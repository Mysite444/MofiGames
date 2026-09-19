import { createPublicClient } from "./supabase/public-client";
import { fallbackSiteIdentity } from "./static-fallback";
import { isNextControlFlowError } from "./supabase/timeout-fetch";
import { getOrSetFragment } from "./fragment-cache";

// Server-only. Fetches the single `site_identity` row (Admin → Site
// Settings → Site Identity) — Site Name, Site Tagline, Logo, Favicon.
// Kept separate from `seo_settings` (src/lib/seo-settings.ts) since it's a
// smaller, front-of-house "branding" concern rather than deep SEO config.
// Always returns a fully-populated object so callers (layout, Logo) never
// need their own fallback.

export interface SiteIdentity {
  siteName: string;
  siteTagline: string;
  logoUrl: string | null;
  // Full favicon / app-icon set. faviconUrl is the classic favicon.ico
  // (kept as its original name for backward compat — see migration
  // 0061_favicon_icon_set.sql); the rest back the 16/32 PNGs, the SVG,
  // the Apple touch icon, and the two PWA manifest sizes.
  faviconUrl: string | null;
  favicon16Url: string | null;
  favicon32Url: string | null;
  faviconSvgUrl: string | null;
  appleTouchIconUrl: string | null;
  icon192Url: string | null;
  icon512Url: string | null;
  copyrightText: string;
  updatedAt: string;
}

export const DEFAULT_SITE_IDENTITY: SiteIdentity = {
  siteName: "MofiGames",
  siteTagline: "Hundreds of free browser games — no download, just play.",
  logoUrl: null,
  faviconUrl: null,
  favicon16Url: null,
  favicon32Url: null,
  faviconSvgUrl: null,
  appleTouchIconUrl: null,
  icon192Url: null,
  icon512Url: null,
  copyrightText: "© MofiGames. All rights reserved.",
  updatedAt: new Date(0).toISOString(),
};

// Exported so scripts/generate-static-fallback.ts can map a live row into
// the exact same shape this file already reads back out of the fallback
// snapshot — one mapping, never two copies to keep in sync.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapSiteIdentityRow(row: any): SiteIdentity {
  return {
    siteName: row.site_name ?? DEFAULT_SITE_IDENTITY.siteName,
    siteTagline: row.site_tagline ?? DEFAULT_SITE_IDENTITY.siteTagline,
    logoUrl: row.logo_url ?? null,
    faviconUrl: row.favicon_url ?? null,
    favicon16Url: row.favicon_16_url ?? null,
    favicon32Url: row.favicon_32_url ?? null,
    faviconSvgUrl: row.favicon_svg_url ?? null,
    appleTouchIconUrl: row.apple_touch_icon_url ?? null,
    icon192Url: row.icon_192_url ?? null,
    icon512Url: row.icon_512_url ?? null,
    copyrightText: row.copyright_text ?? DEFAULT_SITE_IDENTITY.copyrightText,
    updatedAt: row.updated_at ?? DEFAULT_SITE_IDENTITY.updatedAt,
  };
}

/** Falls back in two steps when the live row can't be read: first to the
 * real, admin-configured identity captured in the last static snapshot
 * (src/data/fallback/site-identity.json — actual site name/logo/copy,
 * not a placeholder), then to the generic DEFAULT_SITE_IDENTITY above
 * only if even that snapshot is missing (e.g. the generator has never
 * been run). Either way this function never throws — a Site Identity
 * outage degrades to "slightly stale branding," never a broken page.
 *
 * Fragment-cached under "site-identity" (Admin → Cache → Fragment Cache,
 * 120s default TTL) — this row is read on nearly every page (header,
 * footer, favicon, homepage) but previously had no caching of its own,
 * making it a live Supabase round trip on every single request. The
 * Site Identity save route (PUT /api/admin/site-identity) purges this
 * fragment immediately on save via invalidateSiteIdentityFragments(), so
 * an admin's change is reflected on the very next request regardless of
 * the TTL — the TTL only matters as a safety net between saves. */
export async function getSiteIdentity(): Promise<SiteIdentity> {
  return getOrSetFragment("site-identity", undefined, async () => {
    try {
      const supabase = createPublicClient();
      const { data, error } = await supabase.from("site_identity").select("*").eq("id", true).maybeSingle();
      if (error || !data) throw error ?? new Error("site_identity: no row");
      return mapSiteIdentityRow(data);
    } catch (err) {
      if (isNextControlFlowError(err)) throw err;
      console.error("[site-identity] Live read failed, using static fallback:", err);
      const snapshot = fallbackSiteIdentity();
      return snapshot ? { ...DEFAULT_SITE_IDENTITY, ...snapshot } : DEFAULT_SITE_IDENTITY;
    }
  });
}
