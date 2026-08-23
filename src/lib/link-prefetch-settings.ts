// Shared between the client (admin UI) and the behaviour-only
// LinkPrefetchController client component mounted in the root layout.
// Same singleton, publicly-readable pattern as dns-prefetch-settings.ts
// — see migration 0049_preloading_prefetching.sql for the table.
//
// Unlike DNS Prefetch/Preconnect (host-level) and Resource Hints
// (specific fetch-now URLs), this is a *behaviour*: hovering (or
// scrolling near, or just landing on the page) a same-origin internal
// link calls the Next.js router's own prefetch() ahead of an actual
// click. Nothing here is rendered as a <link> tag — see
// src/components/LinkPrefetchController.tsx.

export type LinkPrefetchStrategy = "hover" | "viewport" | "eager" | "disabled";

export interface LinkPrefetchSettings {
  enabled: boolean;
  strategy: LinkPrefetchStrategy;
  hoverDelayMs: number;
  maxConcurrentPrefetches: number;
  excludePatterns: string[];
  updatedAt: string;
}

const STRATEGIES: LinkPrefetchStrategy[] = ["hover", "viewport", "eager", "disabled"];

export const LINK_PREFETCH_HOVER_DELAY_LIMITS = { min: 0, max: 2000 } as const;
export const LINK_PREFETCH_CONCURRENCY_LIMITS = { min: 1, max: 20 } as const;

export const DEFAULT_LINK_PREFETCH_SETTINGS: LinkPrefetchSettings = {
  enabled: true,
  strategy: "hover",
  hoverDelayMs: 65,
  maxConcurrentPrefetches: 4,
  excludePatterns: ["/admin", "/api", "/account", "/checkout"],
  updatedAt: new Date(0).toISOString(),
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizePatterns(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    let path = String(item ?? "").trim();
    if (!path) continue;
    if (!path.startsWith("/")) path = `/${path}`;
    if (path.length > 256 || seen.has(path)) continue;
    seen.add(path);
    out.push(path);
  }
  return out;
}

/** Row shape returned by GET /api/link-prefetch/settings (snake_case,
 * as stored) — mapped to the camelCase LinkPrefetchSettings above. */
export function mapLinkPrefetchRow(row: Record<string, unknown> | null): LinkPrefetchSettings {
  if (!row) return DEFAULT_LINK_PREFETCH_SETTINGS;
  const d = DEFAULT_LINK_PREFETCH_SETTINGS;
  const strategy = String(row.strategy ?? "");

  return {
    enabled: Boolean(row.enabled ?? d.enabled),
    strategy: STRATEGIES.includes(strategy as LinkPrefetchStrategy) ? (strategy as LinkPrefetchStrategy) : d.strategy,
    hoverDelayMs: clamp(
      Number(row.hover_delay_ms ?? d.hoverDelayMs),
      LINK_PREFETCH_HOVER_DELAY_LIMITS.min,
      LINK_PREFETCH_HOVER_DELAY_LIMITS.max
    ),
    maxConcurrentPrefetches: clamp(
      Number(row.max_concurrent_prefetches ?? d.maxConcurrentPrefetches),
      LINK_PREFETCH_CONCURRENCY_LIMITS.min,
      LINK_PREFETCH_CONCURRENCY_LIMITS.max
    ),
    excludePatterns: sanitizePatterns(row.exclude_patterns),
    updatedAt: String(row.updated_at ?? d.updatedAt),
  };
}

/** Client-side fetch of the (publicly readable) settings row. Fails
 * soft to the defaults. Used by both the admin UI and
 * LinkPrefetchController — there's no server-rendered output that
 * depends on this (it's behaviour-only), so there's no *-server.ts
 * counterpart the way resource-hint-settings.ts has one. */
export async function fetchLinkPrefetchSettings(): Promise<LinkPrefetchSettings> {
  try {
    const res = await fetch("/api/link-prefetch/settings", { cache: "no-store" });
    if (!res.ok) return DEFAULT_LINK_PREFETCH_SETTINGS;
    const data = await res.json();
    return mapLinkPrefetchRow(data.settings ?? null);
  } catch {
    return DEFAULT_LINK_PREFETCH_SETTINGS;
  }
}
