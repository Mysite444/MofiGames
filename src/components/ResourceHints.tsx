import { getResourceHintSettingsServer } from "@/lib/resource-hint-settings-server";

/**
 * Admin → Cache → Preloading & Prefetching → Resource Hints.
 *
 * Renders <link rel="preload"> for every admin-listed critical resource
 * (a hero font, an above-the-fold image, critical CSS/JS). Next.js
 * hoists <link> elements rendered anywhere in the component tree into
 * the document <head> — same reasoning as DnsPrefetchHints — so this can
 * live in the body of the tree (rendered once from the root layout)
 * rather than needing its own head.tsx.
 *
 * A Server Component: it reads the row directly via
 * getResourceHintSettingsServer() so these tags are present in the very
 * first HTML response for every visitor, signed in or not.
 */
export async function ResourceHints() {
  const settings = await getResourceHintSettingsServer();
  if (!settings.enabled || settings.hints.length === 0) return null;

  return (
    <>
      {settings.hints.map((hint) => (
        <link
          key={hint.id}
          rel="preload"
          href={hint.href}
          as={hint.as}
          type={hint.type || undefined}
          crossOrigin={hint.crossorigin ? "anonymous" : undefined}
          fetchPriority={hint.fetchPriority !== "auto" ? hint.fetchPriority : undefined}
        />
      ))}
    </>
  );
}
