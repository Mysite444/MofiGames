import { AdUnit, type AdPlacementConfig } from "@/components/AdUnit";

/**
 * In-post ad slot — sits inside the game details/description column
 * itself (as opposed to the "Play next" rail), placed beside the stats
 * list in a flex row so it reads the way CrazyGames-style reference
 * layouts do. Fixed at the standard IAB Medium Rectangle size (300x250).
 * Driven by Admin → Monetization → Advertisement Management → Custom
 * HTML Ads — that placement is described as "wherever the site mounts
 * it", and this is that mount point. Renders nothing when it's off.
 */
export function GamePostAdSlot({
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
      placement="game-post"
      config={config}
      adsenseClientId={adsenseClientId}
      adsenseReady={adsenseReady}
      width={300}
      height={250}
    />
  );
}
