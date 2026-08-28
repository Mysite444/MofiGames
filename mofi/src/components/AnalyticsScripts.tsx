import Script from "next/script";
import { getAnalyticsSettings } from "@/lib/analytics-settings";

/** Injects the GA4 (gtag.js) and Microsoft Clarity tracking snippets when
 * an admin has connected them (Admin → Analytics → Connect Integrations).
 * Renders nothing when neither is configured. Search Console needs no
 * script — its verification meta tag is handled by generateMetadata via
 * seo_settings.google_site_verification (migration 0010), not here. */
export async function AnalyticsScripts() {
  const settings = await getAnalyticsSettings();

  if (!settings.ga4MeasurementId && !settings.clarityProjectId) {
    return null;
  }

  return (
    <>
      {settings.ga4MeasurementId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${settings.ga4MeasurementId}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${settings.ga4MeasurementId}');
            `}
          </Script>
        </>
      )}
      {settings.clarityProjectId && (
        <Script id="clarity-init" strategy="afterInteractive">
          {`
            (function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "${settings.clarityProjectId}");
          `}
        </Script>
      )}
    </>
  );
}
