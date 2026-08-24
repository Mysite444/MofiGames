"use client";

import { AdUnit, type AdPlacementConfig } from "@/components/AdUnit";

/**
 * Interstitial shown over the player, in place of the game itself, right
 * after someone clicks Play — Admin → Monetization → Advertisement
 * Management → In-Game Ads. GamePlayerPanel decides *whether* to show
 * this (via shouldShowInGameAd + the configured frequency); this
 * component just renders it and hands control back via onContinue once
 * they're done with it.
 */
export function InGameInterstitial({
  config,
  adsenseClientId,
  adsenseReady,
  onContinue,
}: {
  config: AdPlacementConfig;
  adsenseClientId?: string | null;
  adsenseReady?: boolean;
  onContinue: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/95 px-6 text-center backdrop-blur-sm">
      <AdUnit
        placement="in-game"
        config={config}
        adsenseClientId={adsenseClientId}
        adsenseReady={adsenseReady}
        width={300}
        height={250}
      />
      <button
        type="button"
        onClick={onContinue}
        className="rounded-full bg-white px-6 py-2.5 text-sm font-extrabold tracking-wide text-[#0b0c14] shadow-xl transition-transform hover:scale-105"
      >
        Continue to game
      </button>
    </div>
  );
}
