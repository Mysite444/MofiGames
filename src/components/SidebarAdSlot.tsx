import { AdUnit, type AdPlacementConfig } from "@/components/AdUnit";

/**
 * Sidebar ad slot — fixed at the standard IAB Medium Rectangle size
 * (300x250). Driven by Admin → Monetization → Advertisement Management →
 * Sidebar Ads: renders nothing when that placement is off, the admin's
 * configured creative when it's on, or a placeholder box if it's on but
 * nothing's been pasted in yet. `placement` distinguishes sidebar
 * instances if more than one is ever added back (defaults to "sidebar").
 */
export function SidebarAdSlot({
  config,
  adsenseClientId,
  adsenseReady,
  placement = "sidebar",
}: {
  config: AdPlacementConfig;
  adsenseClientId?: string | null;
  adsenseReady?: boolean;
  placement?: string;
}) {
  return (
    <AdUnit
      placement={placement}
      config={config}
      adsenseClientId={adsenseClientId}
      adsenseReady={adsenseReady}
      width={300}
      height={250}
    />
  );
}
