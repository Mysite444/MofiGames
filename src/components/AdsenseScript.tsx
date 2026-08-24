import Script from "next/script";
import { getAdSettings } from "@/lib/ad-settings";

/** Injects the Google AdSense loader (adsbygoogle.js) site-wide when an
 * admin has turned AdSense on and set a publisher client id (Admin →
 * Monetization → Advertisement Management → Google AdSense). Individual
 * placements (AdUnit) rely on this being loaded before they push their
 * own <ins class="adsbygoogle"> units. If "Enable Auto Ads" is also on,
 * this additionally opts the whole site into Google's automatic ad
 * placement. Renders nothing when AdSense isn't configured. */
export async function AdsenseScript() {
  const settings = await getAdSettings();

  if (!settings.adsense_enabled || !settings.adsense_client_id) {
    return null;
  }

  return (
    <>
      <Script
        async
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${settings.adsense_client_id}`}
        crossOrigin="anonymous"
        strategy="afterInteractive"
      />
      {settings.adsense_auto_ads && (
        <Script id="adsense-auto-ads" strategy="afterInteractive">
          {`
            (adsbygoogle = window.adsbygoogle || []).push({
              google_ad_client: "${settings.adsense_client_id}",
              enable_page_level_ads: true
            });
          `}
        </Script>
      )}
    </>
  );
}
