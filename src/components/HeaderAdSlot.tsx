import { AdUnit, type AdPlacementConfig } from "@/components/AdUnit";

/**
 * Sitewide banner shown at the top of the page, under the site header —
 * Admin → Monetization → Advertisement Management → Header Ads. Mounted
 * once in AppShell, above every page's content. Standard 728x90
 * leaderboard unit, centered, capped to the viewport on small screens.
 * Renders nothing when the placement is off.
 */
export function HeaderAdSlot({
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
    <div className="flex justify-center px-4 pt-3 md:px-6">
      <AdUnit
        placement="header"
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
