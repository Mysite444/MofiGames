import { AdUnit, type AdPlacementConfig } from "@/components/AdUnit";

/**
 * Horizontal ad slot under the player's action bar. Sized like a
 * responsive leaderboard unit (full width of the player column, capped
 * at the standard 728px, fixed 90px tall). Driven by Admin →
 * Monetization → Advertisement Management → Player Ads. Renders nothing
 * when that placement is off.
 */
export function HorizontalAdSlot({
  config,
  adsenseClientId,
  adsenseReady,
}: {
  config: AdPlacementConfig;
  adsenseClientId?: string | null;
  adsenseReady?: boolean;
}) {
  return (
    <AdUnit
      placement="player"
      config={config}
      adsenseClientId={adsenseClientId}
      adsenseReady={adsenseReady}
      width={728}
      height={90}
      className="mx-auto max-w-full"
    />
  );
}
