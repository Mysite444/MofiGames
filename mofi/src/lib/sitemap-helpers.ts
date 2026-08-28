// Advanced SEO Module — XML Sitemap Management. Shared helpers so every
// individual sitemap route (games/categories/tags/blog/pages/images) and
// the sitemap index build valid, identically-formatted XML instead of
// each hand-rolling its own string concatenation.

export interface SitemapUrlEntry {
  loc: string;
  lastModified?: string | Date;
  changeFrequency?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
  images?: { loc: string; caption?: string }[];
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toIso(date: string | Date | undefined): string | undefined {
  if (!date) return undefined;
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export function buildUrlSetXml(entries: SitemapUrlEntry[]): string {
  const hasImages = entries.some((e) => e.images?.length);
  const urlsetOpen = hasImages
    ? '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">'
    : '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';

  const body = entries
    .map((e) => {
      const lastMod = toIso(e.lastModified);
      const parts = [`<loc>${escapeXml(e.loc)}</loc>`];
      if (lastMod) parts.push(`<lastmod>${lastMod}</lastmod>`);
      if (e.changeFrequency) parts.push(`<changefreq>${e.changeFrequency}</changefreq>`);
      if (e.priority !== undefined) parts.push(`<priority>${e.priority.toFixed(1)}</priority>`);
      if (e.images) {
        for (const img of e.images) {
          parts.push(
            `<image:image><image:loc>${escapeXml(img.loc)}</image:loc>${
              img.caption ? `<image:caption>${escapeXml(img.caption)}</image:caption>` : ""
            }</image:image>`
          );
        }
      }
      return `<url>${parts.join("")}</url>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>${urlsetOpen}${body}</urlset>`;
}

export interface SitemapIndexEntry {
  loc: string;
  lastModified?: string | Date;
}

export function buildSitemapIndexXml(entries: SitemapIndexEntry[]): string {
  const body = entries
    .map((e) => {
      const lastMod = toIso(e.lastModified);
      return `<sitemap><loc>${escapeXml(e.loc)}</loc>${lastMod ? `<lastmod>${lastMod}</lastmod>` : ""}</sitemap>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</sitemapindex>`;
}

/** Admin → Cache → Feed Cache → XML Sitemaps controls these two numbers
 * (feed_cache_settings.sitemap_cache_ttl_seconds / _stale_while_revalidate)
 * instead of every sitemap route hardcoding the same Cache-Control —
 * see migration 0047_feed_cache.sql for why sitemap *caching* lives under
 * Cache while sitemap *contents* stay under Admin → SEO → Sitemaps. */
export function buildSitemapHeaders(settings: {
  sitemapCacheTtlSeconds: number;
  sitemapStaleWhileRevalidateSeconds: number;
}): Record<string, string> {
  return {
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": `public, max-age=${settings.sitemapCacheTtlSeconds}, stale-while-revalidate=${settings.sitemapStaleWhileRevalidateSeconds}`,
  };
}
