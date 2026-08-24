// Shared between CacheDnsAdminClient and the API routes under
// src/app/api/admin/cache/dns/**. Pure mapper, no IO. See migration
// 0042b_dns_cache.sql for the table and the reasoning behind the
// two-table split (this file covers the admin-only dns_cache_settings
// row; see dns-prefetch-settings.ts for the publicly-readable half —
// Browser DNS Cache — that the root layout reads on every request).
//
// Covers three of the four DNS Cache pillars:
//   1. Cloudflare DNS   — dnssec_enabled / cname_flattening_mode, synced
//                          to Cloudflare's API on demand (see
//                          src/app/api/admin/cache/dns/sync/route.ts).
//   3. Operating System DNS Cache — nothing enforced here; just a
//                          persisted runbook note (nothing this app runs
//                          can flush a visitor's OS resolver cache).
//   4. Resolver Cache   — configuration for the in-process resolver
//                          cache this app's own server uses for its
//                          outbound DNS lookups (src/lib/resolver-cache.ts).
//
// The row can hold a live Cloudflare API token, so — exactly like
// cdn-cache-settings.ts — the mapper here NEVER includes the raw token.
// Route handlers that actually call Cloudflare read the row directly;
// everything that reaches the browser goes through mapDnsCacheRow below.

export type CnameFlatteningMode = "flatten_at_root" | "flatten_all";
export type DnsSyncStatus = "success" | "partial" | "failed";

export interface DnsCacheSettings {
  // ── 1. Cloudflare DNS ────────────────────────────────────────────────────
  zoneId: string;
  connectedZoneName: string | null;
  /** Whether an API token is currently stored. The token itself is never
   * sent to the client — only this and a short preview. */
  apiTokenSet: boolean;
  /** Last 4 characters of the stored token, e.g. "…a91f", or null. */
  apiTokenPreview: string | null;
  dnssecEnabled: boolean;
  cnameFlatteningMode: CnameFlatteningMode;
  lastSyncedAt: string | null;
  lastSyncStatus: DnsSyncStatus | null;
  lastSyncSummary: Record<string, unknown> | null;

  // ── 4. Resolver Cache ────────────────────────────────────────────────────
  resolverCacheEnabled: boolean;
  resolverCacheMinTtlSeconds: number;
  resolverCacheMaxTtlSeconds: number;
  resolverCacheMaxEntries: number;
  resolverCacheLastClearedAt: string | null;

  // ── 3. Operating System DNS Cache ───────────────────────────────────────
  osDnsRunbookNotes: string;

  updatedAt: string;
}

export const CNAME_FLATTENING_MODES: CnameFlatteningMode[] = ["flatten_at_root", "flatten_all"];
const SYNC_STATUSES: DnsSyncStatus[] = ["success", "partial", "failed"];

export const RESOLVER_TTL_LIMITS = {
  min: { min: 5, max: 3600 },
  max: { min: 60, max: 86400 },
} as const;
export const RESOLVER_MAX_ENTRIES_LIMITS = { min: 10, max: 5000 } as const;

/** Used whenever the row can't be loaded, and as the base for a freshly
 * seeded row (migration 0042) — no zone connected yet, sane defaults for
 * everything else. Mirrors the column defaults in the migration. */
export const DEFAULT_DNS_CACHE_SETTINGS: DnsCacheSettings = {
  zoneId: "",
  connectedZoneName: null,
  apiTokenSet: false,
  apiTokenPreview: null,
  dnssecEnabled: false,
  cnameFlatteningMode: "flatten_at_root",
  lastSyncedAt: null,
  lastSyncStatus: null,
  lastSyncSummary: null,

  resolverCacheEnabled: true,
  resolverCacheMinTtlSeconds: 30,
  resolverCacheMaxTtlSeconds: 3600,
  resolverCacheMaxEntries: 500,
  resolverCacheLastClearedAt: null,

  osDnsRunbookNotes:
    "Advise a visitor to flush their OS DNS cache only after a real DNS change (nameserver migration, record cutover). Windows: ipconfig /flushdns · macOS: sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder · Linux (systemd): sudo resolvectl flush-caches.",

  updatedAt: new Date(0).toISOString(),
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Row shape returned by GET /api/admin/cache/dns/settings (snake_case,
 * as stored) — already redacted server-side, so this never sees a raw
 * dns_api_token, only api_token_set/api_token_preview. */
export function mapDnsCacheRow(row: Record<string, unknown> | null): DnsCacheSettings {
  if (!row) return DEFAULT_DNS_CACHE_SETTINGS;
  const d = DEFAULT_DNS_CACHE_SETTINGS;

  const flatteningMode = String(row.cname_flattening_mode ?? "");
  const syncStatus = String(row.dns_last_sync_status ?? "");

  return {
    zoneId: String(row.dns_zone_id ?? ""),
    connectedZoneName: row.dns_connected_zone_name ? String(row.dns_connected_zone_name) : null,
    apiTokenSet: Boolean(row.api_token_set),
    apiTokenPreview: row.api_token_preview ? String(row.api_token_preview) : null,
    dnssecEnabled: Boolean(row.dnssec_enabled),
    cnameFlatteningMode: CNAME_FLATTENING_MODES.includes(flatteningMode as CnameFlatteningMode)
      ? (flatteningMode as CnameFlatteningMode)
      : d.cnameFlatteningMode,
    lastSyncedAt: row.dns_last_synced_at ? String(row.dns_last_synced_at) : null,
    lastSyncStatus: SYNC_STATUSES.includes(syncStatus as DnsSyncStatus) ? (syncStatus as DnsSyncStatus) : null,
    lastSyncSummary: (row.dns_last_sync_summary as Record<string, unknown> | null) ?? null,

    resolverCacheEnabled: row.resolver_cache_enabled === undefined ? d.resolverCacheEnabled : Boolean(row.resolver_cache_enabled),
    resolverCacheMinTtlSeconds: clamp(
      Number(row.resolver_cache_min_ttl_seconds ?? d.resolverCacheMinTtlSeconds),
      RESOLVER_TTL_LIMITS.min.min,
      RESOLVER_TTL_LIMITS.min.max
    ),
    resolverCacheMaxTtlSeconds: clamp(
      Number(row.resolver_cache_max_ttl_seconds ?? d.resolverCacheMaxTtlSeconds),
      RESOLVER_TTL_LIMITS.max.min,
      RESOLVER_TTL_LIMITS.max.max
    ),
    resolverCacheMaxEntries: clamp(
      Number(row.resolver_cache_max_entries ?? d.resolverCacheMaxEntries),
      RESOLVER_MAX_ENTRIES_LIMITS.min,
      RESOLVER_MAX_ENTRIES_LIMITS.max
    ),
    resolverCacheLastClearedAt: row.resolver_cache_last_cleared_at ? String(row.resolver_cache_last_cleared_at) : null,

    osDnsRunbookNotes: typeof row.os_dns_runbook_notes === "string" ? row.os_dns_runbook_notes : d.osDnsRunbookNotes,

    updatedAt: String(row.updated_at ?? d.updatedAt),
  };
}

/** Turns a raw stored token into the redacted fields the client is
 * allowed to see. Shared by the settings GET route and the sync route
 * (which re-reads the row afterwards to return an updated snapshot).
 * Self-contained here rather than imported from cdn-cache-settings.ts —
 * every phase in this app owns its own small helpers rather than
 * reaching across into another phase's module. */
export function redactDnsApiToken(token: string | null | undefined): { apiTokenSet: boolean; apiTokenPreview: string | null } {
  if (!token) return { apiTokenSet: false, apiTokenPreview: null };
  return { apiTokenSet: true, apiTokenPreview: token.length > 4 ? `…${token.slice(-4)}` : "…" };
}
