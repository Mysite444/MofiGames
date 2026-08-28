import { AdUnit, type AdPlacementConfig } from "@/components/AdUnit";

/**
 * Sitewide banner shown at the bottom of the page — Admin → Monetization
 * → Advertisement Management → Footer Ads. Mounted once in AppShell,
 * after every page's content. Standard 728x90 leaderboard unit, centered.
 * Renders nothing when the placement is off.
 */
export function FooterAdSlot({
  config,
  adsenseClientId,
  adsenseReady,
}: {
  config: AdPlacementConfig;
  adsenseClientId?: string | null;
  adsenseReady?: boolean;
}) {
  if (!config.enabled) return null;

  return (
    <div className="flex justify-center px-4 pb-3 pt-6 md:px-6">
      <AdUnit
        placement="footer"
        config={config}
        adsenseClientId={adsenseClientId}
        adsenseReady={adsenseReady}
        width={728}
        height={90}
        className="max-w-full"
      />
    </div>
  );
}
