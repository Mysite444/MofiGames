// Shared between client (admin UI) and server (the root layout, which
// renders <link rel="dns-prefetch"/preconnect"> tags for every visitor):
// the dns_prefetch_settings row shape and a pure mapper. Same singleton,
// publicly-readable pattern as cache-settings.ts — see migration
// 0042b_dns_cache.sql for the table and why this is a separate table from
// dns-cache-settings.ts (that one holds a live Cloudflare API token and
// is admin-only; this one has to be readable by anonymous page loads).
//
// This is the "Browser DNS Cache" pillar of Admin → Cache → DNS Cache:
// the only lever a website actually has over a *browser's* DNS
// behaviour — resolving a third-party host's DNS (and optionally
// opening the TCP/TLS connection) before the browser would otherwise
// need it, via <link> hints and the X-DNS-Prefetch-Control header.

export interface DnsPrefetchSettings {
  dnsPrefetchControlEnabled: boolean;
  dnsPrefetchDomains: string[];
  preconnectDomains: string[];
  updatedAt: string;
}

export const DEFAULT_DNS_PREFETCH_SETTINGS: DnsPrefetchSettings = {
  dnsPrefetchControlEnabled: true,
  dnsPrefetchDomains: ["www.googletagmanager.com", "www.clarity.ms", "pagead2.googlesyndication.com"],
  preconnectDomains: ["www.googletagmanager.com"],
  updatedAt: new Date(0).toISOString(),
};

/** Bare hostname only — no scheme, no path, no port. Matches how these
 * render: <link rel="dns-prefetch" href="//{domain}">. */
export const DNS_DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

function sanitizeDomainList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const domain = String(item ?? "").trim().toLowerCase();
    if (!domain || !DNS_DOMAIN_PATTERN.test(domain) || seen.has(domain)) continue;
    seen.add(domain);
    out.push(domain);
  }
  return out;
}

/** Row shape returned by GET /api/dns-prefetch/settings (snake_case, as
 * stored) — mapped to the camelCase DnsPrefetchSettings above. */
export function mapDnsPrefetchRow(row: Record<string, unknown> | null): DnsPrefetchSettings {
  if (!row) return DEFAULT_DNS_PREFETCH_SETTINGS;
  return {
    dnsPrefetchControlEnabled:
      row.dns_prefetch_control_enabled === undefined
        ? DEFAULT_DNS_PREFETCH_SETTINGS.dnsPrefetchControlEnabled
        : Boolean(row.dns_prefetch_control_enabled),
    dnsPrefetchDomains: sanitizeDomainList(row.dns_prefetch_domains),
    preconnectDomains: sanitizeDomainList(row.preconnect_domains),
    updatedAt: String(row.updated_at ?? DEFAULT_DNS_PREFETCH_SETTINGS.updatedAt),
  };
}

/** Client-side fetch of the (publicly readable) settings row. Fails
 * soft to the defaults. Browser-only — server components/route handlers
 * should query dns_prefetch_settings directly instead (see
 * src/components/DnsPrefetchHints.tsx), the same split as
 * cache-settings.ts / cache-settings-server.ts. */
export async function fetchDnsPrefetchSettings(): Promise<DnsPrefetchSettings> {
  try {
    const res = await fetch("/api/dns-prefetch/settings", { cache: "no-store" });
    if (!res.ok) return DEFAULT_DNS_PREFETCH_SETTINGS;
    const data = await res.json();
    return mapDnsPrefetchRow(data.settings ?? null);
  } catch {
    return DEFAULT_DNS_PREFETCH_SETTINGS;
  }
}
