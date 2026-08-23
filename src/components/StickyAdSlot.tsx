"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { AdUnit, type AdPlacementConfig } from "@/components/AdUnit";

/**
 * Sitewide anchored banner that stays fixed on screen while the page
 * scrolls — Admin → Monetization → Advertisement Management → Sticky
 * Ads. Mounted once in AppShell so it floats over every page.
 *
 * "Bottom" anchors flush to the viewport bottom edge (no overlap with
 * anything else fixed on the page). "Top" anchors just under the fixed
 * site header (top-14 === the header's own 3.5rem height) rather than
 * over it, so the logo/nav stay clickable — it can still overlap the
 * very top of a page's own content when scrolled all the way up, the
 * same tradeoff most "sticky top bar" ad implementations make.
 */
export function StickyAdSlot({
  config,
  position,
  dismissible,
  adsenseClientId,
  adsenseReady,
}: {
  config: AdPlacementConfig;
  position: "top" | "bottom";
  dismissible: boolean;
  adsenseClientId?: string | null;
  adsenseReady?: boolean;
}) {
  const [dismissed, setDismissed] = useState(false);

  if (!config.enabled || dismissed) return null;

  return (
    <div
      className={`fixed inset-x-0 z-20 flex justify-center border-white/10 bg-[var(--color-menu-bg)]/95 px-4 py-2 backdrop-blur-xl ${
        position === "top" ? "top-14 border-b" : "bottom-0 border-t"
      }`}
    >
      <div className="relative flex max-w-full items-center">
        <AdUnit
          placement="sticky"
          config={config}
          adsenseClientId={adsenseClientId}
          adsenseReady={adsenseReady}
          width={728}
          height={90}
          className="max-w-full"
        />
        {dismissible && (
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss ad"
            className="ml-3 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
