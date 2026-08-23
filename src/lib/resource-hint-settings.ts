// Shared between the client (admin UI) and server (the root layout,
// which renders <link rel="preload"> tags for every visitor): the
// resource_hint_settings row shape and a pure mapper. Same singleton,
// publicly-readable pattern as dns-prefetch-settings.ts — see migration
// 0049_preloading_prefetching.sql for the table.
//
// This is "tell the browser to start fetching this exact URL early" —
// distinct from Static Asset Cache (which sets Cache-Control headers
// per asset *type*) and from DNS Prefetch/Preconnect (which only warm
// up the connection to a *host*, not fetch a specific resource).

export type ResourceHintAs =
  | "font"
  | "image"
  | "style"
  | "script"
  | "fetch"
  | "document"
  | "video"
  | "audio"
  | "track";

export type ResourceHintFetchPriority = "high" | "low" | "auto";

export interface ResourceHint {
  /** 8-char id, stable across edits so React keys don't thrash. */
  id: string;
  href: string;
  as: ResourceHintAs;
  /** MIME type — required by browsers for `as="font"` to actually apply. */
  type: string;
  crossorigin: boolean;
  fetchPriority: ResourceHintFetchPriority;
}

export interface ResourceHintSettings {
  enabled: boolean;
  hints: ResourceHint[];
  updatedAt: string;
}

export const RESOURCE_HINT_AS_VALUES: ResourceHintAs[] = [
  "font",
  "image",
  "style",
  "script",
  "fetch",
  "document",
  "video",
  "audio",
  "track",
];

export const RESOURCE_HINT_FETCH_PRIORITIES: ResourceHintFetchPriority[] = ["high", "low", "auto"];

export const DEFAULT_RESOURCE_HINT_SETTINGS: ResourceHintSettings = {
  enabled: true,
  hints: [],
  updatedAt: new Date(0).toISOString(),
};

function randomHintId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Re-sanitizes every hint on the way out regardless of what's actually
 * stored — never trust the row blindly, same stance dns-prefetch-
 * settings.ts takes with its domain list. */
export function sanitizeHints(raw: unknown): ResourceHint[] {
  if (!Array.isArray(raw)) return [];
  const out: ResourceHint[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const href = String(obj.href ?? "").trim();
    if (!href || href.length > 2048) continue;
    const as = RESOURCE_HINT_AS_VALUES.includes(obj.as as ResourceHintAs) ? (obj.as as ResourceHintAs) : "fetch";
    const fetchPriority = RESOURCE_HINT_FETCH_PRIORITIES.includes(obj.fetchPriority as ResourceHintFetchPriority)
      ? (obj.fetchPriority as ResourceHintFetchPriority)
      : "auto";
    out.push({
      id: typeof obj.id === "string" && obj.id ? obj.id : randomHintId(),
      href,
      as,
      type: String(obj.type ?? "").trim(),
      crossorigin: Boolean(obj.crossorigin),
      fetchPriority,
    });
  }
  return out.slice(0, 50);
}

/** Row shape returned by GET /api/resource-hints/settings (snake_case,
 * as stored) — mapped to the camelCase ResourceHintSettings above. */
export function mapResourceHintRow(row: Record<string, unknown> | null): ResourceHintSettings {
  if (!row) return DEFAULT_RESOURCE_HINT_SETTINGS;
  return {
    enabled: Boolean(row.enabled ?? DEFAULT_RESOURCE_HINT_SETTINGS.enabled),
    hints: sanitizeHints(row.hints),
    updatedAt: String(row.updated_at ?? DEFAULT_RESOURCE_HINT_SETTINGS.updatedAt),
  };
}


