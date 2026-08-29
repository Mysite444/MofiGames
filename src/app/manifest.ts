import type { MetadataRoute } from "next";
import { getSiteIdentity } from "@/lib/site-identity";

/**
 * Backs /manifest.webmanifest (Next.js serves whatever this file default-
 * exports at that well-known path automatically — no route.ts needed).
 * Read by Android/Chrome for "Add to Home Screen" / PWA install prompts.
 *
 * icon-192/icon-512 come from Site Identity (Admin → Site Settings →
 * Site Identity) when the admin has uploaded them. Each size is only
 * included if actually set — never a real upload for one size paired
 * with the bundled default for the other, which would show the brand
 * default on some devices/densities and the real logo on others. If
 * neither is set, both bundled defaults are used together so "Add to
 * Home Screen" still has a valid icon set instead of none.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const identity = await getSiteIdentity();

  const hasCustomIcon = Boolean(identity.icon192Url || identity.icon512Url);
  const icons: NonNullable<MetadataRoute.Manifest["icons"]> = [];

  if (identity.icon192Url) {
    icons.push({ src: identity.icon192Url, sizes: "192x192", type: "image/png", purpose: "any" });
  } else if (!hasCustomIcon) {
    icons.push({ src: "/default-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" });
  }

  if (identity.icon512Url) {
    icons.push({ src: identity.icon512Url, sizes: "512x512", type: "image/png", purpose: "any" });
  } else if (!hasCustomIcon) {
    icons.push({ src: "/default-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" });
  }

  return {
    name: identity.siteName,
    short_name: identity.siteName,
    description: identity.siteTagline,
    start_url: "/",
    display: "standalone",
    background_color: "#0d0d0d",
    theme_color: "#0d0d0d",
    icons,
  };
}
