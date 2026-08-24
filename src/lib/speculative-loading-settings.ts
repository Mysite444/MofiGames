// Shared between the client (admin UI) and server (the root layout,
// which renders a <script type="speculationrules"> tag for every
// visitor): the speculative_loading_settings row shape and a pure
// mapper. Same singleton, publicly-readable pattern as
// dns-prefetch-settings.ts — see migration
// 0049_preloading_prefetching.sql for the table.
//
// This is the browser Speculation Rules API — well past what Link
// Prefetch or DNS Prefetch/Preconnect do: "prefetch" fetches a page's
// HTML ahead of navigation, "prerender" fully renders it in a hidden
// tab. Off by default (unlike the lighter-weight hints elsewhere on
// this page) because prerendering has real side effects — analytics
// firing, form state, non-idempotent GETs — if pointed at the wrong
// URLs.

export type SpeculativeLoadingMode = "prefetch" | "prerender";
export type SpeculativeLoadingEagerness = "conservative" | "moderate" | "eager" | "immediate";

export interface SpeculativeLoadingSettings {
  enabled: boolean;
  mode: SpeculativeLoadingMode;
  eagerness: SpeculativeLoadingEagerness;
  includePatterns: string[];
  excludePatterns: string[];
  updatedAt: string;
}

const MODES: SpeculativeLoadingMode[] = ["prefetch", "prerender"];
const EAGERNESS_LEVELS: SpeculativeLoadingEagerness[] = ["conservative", "moderate", "eager", "immediate"];

export const DEFAULT_SPECULATIVE_LOADING_SETTINGS: SpeculativeLoadingSettings = {
  enabled: false,
  mode: "prefetch",
  eagerness: "moderate",
  includePatterns: ["/games/*"],
  excludePatterns: ["/admin/*", "/account/*", "/api/*", "/checkout/*"],
  updatedAt: new Date(0).toISOString(),
};

function sanitizePatterns(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const pattern = String(item ?? "").trim();
    if (!pattern || pattern.length > 256 || seen.has(pattern)) continue;
    seen.add(pattern);
    out.push(pattern);
  }
  return out;
}

/** Row shape returned by GET /api/speculative-loading/settings
 * (snake_case, as stored) — mapped to the camelCase
 * SpeculativeLoadingSettings above. */
export function mapSpeculativeLoadingRow(row: Record<string, unknown> | null): SpeculativeLoadingSettings {
  if (!row) return DEFAULT_SPECULATIVE_LOADING_SETTINGS;
  const d = DEFAULT_SPECULATIVE_LOADING_SETTINGS;
  const mode = String(row.mode ?? "");
  const eagerness = String(row.eagerness ?? "");

  return {
    enabled: Boolean(row.enabled ?? d.enabled),
    mode: MODES.includes(mode as SpeculativeLoadingMode) ? (mode as SpeculativeLoadingMode) : d.mode,
    eagerness: EAGERNESS_LEVELS.includes(eagerness as SpeculativeLoadingEagerness)
      ? (eagerness as SpeculativeLoadingEagerness)
      : d.eagerness,
    includePatterns: sanitizePatterns(row.include_patterns),
    excludePatterns: sanitizePatterns(row.exclude_patterns),
    updatedAt: String(row.updated_at ?? d.updatedAt),
  };
}


