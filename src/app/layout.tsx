import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthProvider } from "@/lib/auth-context";
import { LibrarySync } from "@/components/LibrarySync";
import { RealGamesSync } from "@/components/RealGamesSync";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { SessionTimeoutManager } from "@/components/SessionTimeoutManager";
import { JsonLd } from "@/components/JsonLd";
import { DnsPrefetchHints } from "@/components/DnsPrefetchHints";
import { ResourceHints } from "@/components/ResourceHints";
import { SpeculationRules } from "@/components/SpeculationRules";
import { LinkPrefetchController } from "@/components/LinkPrefetchController";
import { AnalyticsScripts } from "@/components/AnalyticsScripts";
import { AnalyticsTracker } from "@/components/AnalyticsTracker";
import { NavigationLoadingOverlay } from "@/components/NavigationLoadingOverlay";
import { AdsenseScript } from "@/components/AdsenseScript";
import { getSeoSettings } from "@/lib/seo-settings";
import { getSiteIdentity } from "@/lib/site-identity";
import { getAdSettings } from "@/lib/ad-settings";
import { SITE_URL, organizationSchema, websiteSchema, applyTitleTemplate } from "@/lib/seo";
import "./globals.css";

/**
 * viewport-fit=cover lets position:fixed overlays (MobileLandscapePlayer)
 * extend to the full physical screen — behind the notch and the home
 * indicator — so the game iframe fills the entire display.
 * Without this, inset:0 stops at the OS safe-area boundary on iOS and
 * env(safe-area-inset-*) always resolves to 0, breaking the edge-UI fix.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export async function generateMetadata(): Promise<Metadata> {
  const [settings, identity] = await Promise.all([getSeoSettings(), getSiteIdentity()]);
  // Site Identity (Admin → Site Settings → Site Identity) is the
  // front-of-house source of truth for the site name and favicon; SEO
  // Global Settings' own site_name still drives the title template/OG tags.
  const siteName = identity.siteName || settings.siteName;
  const iconVersion = encodeURIComponent(identity.updatedAt);
  // Cache-busted admin-uploaded URL, or null if that slot was never set.
  const versionedIconUrl = (url: string | null) =>
    url ? `${url}${url.includes("?") ? "&" : "?"}v=${iconVersion}` : null;

  // Only 16x16 / 32x32 / SVG entries the admin actually uploaded get a
  // <link rel="icon"> tag — an unset slot is omitted entirely rather than
  // filled with a bundled default. This matters because most modern
  // browsers PREFER an SVG (or a more specific sized PNG) icon over the
  // plain favicon.ico when one is present in the list, regardless of link
  // order. Shipping a default "M" SVG unconditionally meant it silently
  // outranked and hid a real favicon.ico/PNG the admin had uploaded — the
  // exact bug this list avoids now. /favicon.ico itself is always safe to
  // include unconditionally since that route already falls back to the
  // bundled default internally (see src/app/favicon.ico/route.ts) and
  // sits lowest-priority for browsers that also see a more specific icon.
  const iconLinks: { url: string; sizes?: string; type?: string }[] = [
    { url: `/favicon.ico?v=${iconVersion}`, sizes: "any" },
  ];
  const favicon16 = versionedIconUrl(identity.favicon16Url);
  if (favicon16) iconLinks.push({ url: favicon16, sizes: "16x16", type: "image/png" });
  const favicon32 = versionedIconUrl(identity.favicon32Url);
  if (favicon32) iconLinks.push({ url: favicon32, sizes: "32x32", type: "image/png" });
  const faviconSvg = versionedIconUrl(identity.faviconSvgUrl);
  if (faviconSvg) iconLinks.push({ url: faviconSvg, type: "image/svg+xml" });

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      template: settings.titleTemplate.replace("%title%", "%s"),
      default:
        settings.homeSeoTitle?.trim() ||
        applyTitleTemplate(settings.titleTemplate, {
          title: "Free Online Games",
          site_name: siteName,
        }),
    },
    description:
      settings.homeMetaDescription?.trim() || identity.siteTagline || settings.defaultMetaDescription,
    // The classic /favicon.ico is always the same single proxied URL —
    // never identity.faviconUrl directly. Pointing the explicit <link>
    // tag at one URL while the browser's own built-in /favicon.ico probe
    // resolves to a *different* one (the external Supabase URL) is
    // exactly what caused the old-then-new flash: two different sources
    // racing, whichever responds first wins the first paint. Routing both
    // through the same endpoint (see src/app/favicon.ico/route.ts, which
    // proxies the bytes in one hop instead of redirecting) removes the
    // race entirely. Same reasoning applies to /apple-touch-icon.png (see
    // src/app/apple-touch-icon.png/route.ts) since iOS also probes that
    // filename at the root independent of any <link> tag.
    icons: {
      icon: iconLinks,
      shortcut: `/favicon.ico?v=${iconVersion}`,
      apple: [
        { url: `/apple-touch-icon.png?v=${iconVersion}`, sizes: "180x180" },
      ],
    },
    manifest: "/manifest.webmanifest",
    verification: {
      google: settings.googleSiteVerification || undefined,
      other: {
        ...(settings.bingSiteVerification ? { "msvalidate.01": settings.bingSiteVerification } : {}),
        ...(settings.yandexSiteVerification ? { "yandex-verification": settings.yandexSiteVerification } : {}),
        ...(settings.baiduSiteVerification ? { "baidu-site-verification": settings.baiduSiteVerification } : {}),
      },
    },
    openGraph: {
      siteName: settings.siteName,
      type: "website",
      images: settings.homeOgImageUrl || settings.defaultOgImageUrl
        ? [{ url: (settings.homeOgImageUrl || settings.defaultOgImageUrl)!, alt: settings.defaultOgImageAlt || settings.siteName }]
        : undefined,
    },
    twitter: {
      card: settings.twitterCardType,
      site: settings.twitterSite || undefined,
      creator: settings.twitterCreator || undefined,
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Independent reads — previously two sequential awaits that had to both
  // finish before RootLayout could even return its JSX (which is what
  // lets the page and the sibling hint/script components below start
  // rendering at all). See MOFIGAMES_PERFORMANCE_AUDIT.md.
  const [settings, adSettings, identity] = await Promise.all([
    getSeoSettings(),
    getAdSettings(),
    getSiteIdentity(),
  ]);
  const adsenseReady = adSettings.adsense_enabled && Boolean(adSettings.adsense_client_id);

  return (
    <html lang={settings.defaultLanguage} className="h-full antialiased">
      <body className="min-h-full">
        <DnsPrefetchHints />
        <ResourceHints />
        <SpeculationRules />
        <JsonLd data={[organizationSchema(settings), websiteSchema(settings)]} />
        <AnalyticsScripts />
        <AdsenseScript />
        <Suspense fallback={null}>
          <AnalyticsTracker />
        </Suspense>
        <Suspense fallback={null}>
          <NavigationLoadingOverlay />
        </Suspense>
        <AuthProvider>
          <LibrarySync />
          <RealGamesSync />
          <ServiceWorkerRegister />
          <LinkPrefetchController />
          <SessionTimeoutManager />
          <AppShell
            copyrightText={identity.copyrightText}
            adSettings={{
              header: {
                enabled: adSettings.header_ads_enabled,
                slotId: adSettings.header_ads_slot_id,
                code: adSettings.header_ads_code,
              },
              footer: {
                enabled: adSettings.footer_ads_enabled,
                slotId: adSettings.footer_ads_slot_id,
                code: adSettings.footer_ads_code,
              },
              sticky: {
                enabled: adSettings.sticky_ads_enabled,
                slotId: adSettings.sticky_ads_slot_id,
                code: adSettings.sticky_ads_code,
              },
              stickyPosition: adSettings.sticky_ads_position,
              stickyDismissible: adSettings.sticky_ads_dismissible,
              adsenseClientId: adSettings.adsense_client_id,
              adsenseReady,
            }}
          >
            {children}
          </AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
