import { getSpeculativeLoadingSettingsServer } from "@/lib/speculative-loading-settings-server";

/**
 * Admin → Cache → Preloading & Prefetching → Speculative Loading.
 *
 * Renders a <script type="speculationrules"> tag — the browser
 * Speculation Rules API — built from the admin-configured mode
 * (prefetch/prerender), eagerness, and include/exclude URL-pattern
 * lists. Unsupported browsers simply ignore an unrecognised script
 * type, so this needs no feature detection.
 *
 * A Server Component, not a route handler: it reads the row directly
 * via getSpeculativeLoadingSettingsServer() so the rules are present in
 * the very first HTML response for every visitor. Off by default (see
 * speculative-loading-settings.ts) — renders nothing until an admin
 * opts in.
 */
export async function SpeculationRules() {
  const settings = await getSpeculativeLoadingSettingsServer();
  if (!settings.enabled || settings.includePatterns.length === 0) return null;

  const rules = {
    [settings.mode]: [
      {
        source: "document",
        where: {
          and: [
            { href_matches: settings.includePatterns },
            ...(settings.excludePatterns.length ? [{ not: { href_matches: settings.excludePatterns } }] : []),
          ],
        },
        eagerness: settings.eagerness,
      },
    ],
  };

  return (
    // eslint-disable-next-line react/no-danger
    <script
      type="speculationrules"
      // Static, admin-authored URL-pattern config only — never
      // user-supplied HTML — so this is the same trust level as the
      // JSON-LD blocks JsonLd.tsx already emits the same way.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(rules) }}
    />
  );
}
