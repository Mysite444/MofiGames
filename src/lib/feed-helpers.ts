// Feed Cache — shared, framework-agnostic builders for the three
// syndication formats Admin → Cache → Feed Cache configures: RSS 2.0
// (/feed.xml), Atom 1.0 (/atom.xml), and JSON Feed 1.1 (/feed.json). All
// three are alternate representations of the same FeedItem list — see
// getFeedItems() in feed-content-server.ts for where that list comes
// from — so the shape here mirrors sitemap-helpers.ts: pure string/object
// builders, no IO, easy to unit-test, impossible for the three formats to
// drift from each other on what "an item" contains.

export interface FeedItem {
  /** Stable, globally-unique id — this app uses the item's absolute URL. */
  id: string;
  title: string;
  /** Absolute URL to the canonical page for this item. */
  link: string;
  /** Short plain-text summary (post excerpt / game description). */
  summary: string;
  /** Full HTML body, when available (blog posts have one, games don't). */
  contentHtml?: string;
  imageUrl?: string | null;
  author?: string;
  publishedAt: string;
  updatedAt?: string;
}

export interface FeedMeta {
  title: string;
  link: string;
  description: string;
  /** Absolute URL of the feed document itself (RSS <atom:link>, Atom <id>/<link rel="self">). */
  selfUrl: string;
  language?: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toRfc822(date: string): string {
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? new Date(0).toUTCString() : d.toUTCString();
}

function toIso(date: string): string {
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
}

/** Cache-Control shared by all three feed formats — the same
 * "public, max-age, stale-while-revalidate" shape sitemap-helpers.ts
 * uses, just with the per-format TTL Admin → Cache → Feed Cache sets. */
export function buildFeedHeaders(contentType: string, ttlSeconds: number): Record<string, string> {
  return {
    "Content-Type": contentType,
    // A feed reader polling every few minutes shouldn't ever fully block
    // on regeneration — stale-while-revalidate is fixed at 4x the TTL,
    // same ratio full-page-cache-settings.ts uses elsewhere in this app.
    "Cache-Control": `public, max-age=${ttlSeconds}, stale-while-revalidate=${ttlSeconds * 4}`,
  };
}

// ── RSS 2.0 ──────────────────────────────────────────────────────────────

export function buildRssXml(items: FeedItem[], meta: FeedMeta): string {
  const lastBuildDate = items[0]?.publishedAt ? toRfc822(items[0].publishedAt) : new Date().toUTCString();
  const itemsXml = items
    .map((item) => {
      const parts = [
        `<title>${escapeXml(item.title)}</title>`,
        `<link>${escapeXml(item.link)}</link>`,
        `<guid isPermaLink="true">${escapeXml(item.link)}</guid>`,
        `<pubDate>${toRfc822(item.publishedAt)}</pubDate>`,
        `<description>${escapeXml(item.summary)}</description>`,
      ];
      if (item.contentHtml) {
        parts.push(`<content:encoded><![CDATA[${item.contentHtml}]]></content:encoded>`);
      }
      if (item.author) parts.push(`<author>${escapeXml(item.author)}</author>`);
      return `<item>${parts.join("")}</item>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${escapeXml(
    meta.title
  )}</title><link>${escapeXml(meta.link)}</link><description>${escapeXml(
    meta.description
  )}</description><language>${meta.language ?? "en"}</language><lastBuildDate>${lastBuildDate}</lastBuildDate><atom:link href="${escapeXml(
    meta.selfUrl
  )}" rel="self" type="application/rss+xml"/>${itemsXml}</channel></rss>`;
}

// ── Atom 1.0 (RFC 4287) ──────────────────────────────────────────────────

export function buildAtomXml(items: FeedItem[], meta: FeedMeta): string {
  const updated = items[0]?.publishedAt ? toIso(items[0].publishedAt) : new Date().toISOString();
  const entriesXml = items
    .map((item) => {
      const parts = [
        `<title>${escapeXml(item.title)}</title>`,
        `<link href="${escapeXml(item.link)}"/>`,
        `<id>${escapeXml(item.link)}</id>`,
        `<published>${toIso(item.publishedAt)}</published>`,
        `<updated>${toIso(item.updatedAt ?? item.publishedAt)}</updated>`,
        `<summary>${escapeXml(item.summary)}</summary>`,
      ];
      if (item.contentHtml) {
        parts.push(`<content type="html">${escapeXml(item.contentHtml)}</content>`);
      }
      if (item.author) parts.push(`<author><name>${escapeXml(item.author)}</name></author>`);
      return `<entry>${parts.join("")}</entry>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>${escapeXml(
    meta.title
  )}</title><link href="${escapeXml(meta.link)}"/><link href="${escapeXml(
    meta.selfUrl
  )}" rel="self"/><id>${escapeXml(meta.link)}</id><updated>${updated}</updated><subtitle>${escapeXml(
    meta.description
  )}</subtitle>${entriesXml}</feed>`;
}

// ── JSON Feed 1.1 (https://www.jsonfeed.org/version/1.1/) ────────────────

export function buildJsonFeed(items: FeedItem[], meta: FeedMeta): object {
  return {
    version: "https://jsonfeed.org/version/1.1",
    title: meta.title,
    home_page_url: meta.link,
    feed_url: meta.selfUrl,
    description: meta.description,
    items: items.map((item) => ({
      id: item.id,
      url: item.link,
      title: item.title,
      summary: item.summary,
      ...(item.contentHtml ? { content_html: item.contentHtml } : {}),
      ...(item.imageUrl ? { image: item.imageUrl } : {}),
      ...(item.author ? { authors: [{ name: item.author }] } : {}),
      date_published: toIso(item.publishedAt),
      date_modified: toIso(item.updatedAt ?? item.publishedAt),
    })),
  };
}
