import { getDnsPrefetchSettingsServer } from "@/lib/dns-prefetch-settings-server";

/**
 * Admin → Cache → DNS Cache → Browser DNS Cache.
 *
 * Renders <link rel="dns-prefetch"> (and, for the smaller "on the
 * critical path" subset, <link rel="preconnect">) for the admin-
 * configured third-party hostnames. Next.js hoists <link> elements
 * rendered anywhere in the component tree into the document <head> —
 * see https://nextjs.org/docs/app/api-reference/file-conventions/head —
 * so this can live in the body of the tree (rendered once from the root
 * layout) rather than needing its own head.tsx.
 *
 * A Server Component, not a route handler: it reads the row directly
 * via getDnsPrefetchSettingsServer() so these tags are present in the
 * very first HTML response (no client-side fetch, no flash of
 * un-prefetched content) for every visitor, signed in or not.
 */
export async function DnsPrefetchHints() {
  const settings = await getDnsPrefetchSettingsServer();
  const preconnectSet = new Set(settings.preconnectDomains);
  // dns-prefetch is redundant for anything already getting the
  // stronger preconnect treatment.
  const dnsPrefetchOnly = settings.dnsPrefetchDomains.filter((d) => !preconnectSet.has(d));

  return (
    <>
      {settings.preconnectDomains.map((domain) => (
        <link key={`preconnect-${domain}`} rel="preconnect" href={`https://${domain}`} crossOrigin="" />
      ))}
      {dnsPrefetchOnly.map((domain) => (
        <link key={`dns-prefetch-${domain}`} rel="dns-prefetch" href={`//${domain}`} />
      ))}
    </>
  );
}
