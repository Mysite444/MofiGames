"use client";

import { useState } from "react";
import { Gift } from "lucide-react";
import { AdUnit, type AdPlacementConfig } from "@/components/AdUnit";
import { IconButton, Popover } from "@/components/ActionBarControls";

/**
 * Opt-in "watch an ad for a bonus" control — Admin → Monetization →
 * Advertisement Management → Reward Ads. Lives in the player action bar
 * next to the other icon buttons; only rendered when the placement is
 * on. Clicking opens a popover with the configured creative and a claim
 * button — there's no points/currency backend in this project yet, so
 * "claiming" just confirms the reward locally, the same
 * front-end-only spirit as the like/dislike/mute buttons beside it.
 */
export function RewardAdButton({
  config,
  rewardLabel,
  adsenseClientId,
  adsenseReady,
}: {
  config: AdPlacementConfig;
  rewardLabel: string;
  adsenseClientId?: string | null;
  adsenseReady?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [claimed, setClaimed] = useState(false);

  if (!config.enabled) return null;

  return (
    <div className="relative">
      <IconButton
        aria-label="Watch an ad for a bonus"
        label={open ? undefined : "Watch ad for a bonus"}
        active={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Gift size={15} />
      </IconButton>
      {open && (
        <Popover onClose={() => setOpen(false)} align="right">
          {!claimed ? (
            <div className="flex flex-col items-center gap-3">
              <p className="text-center text-xs font-bold text-white">
                Watch an ad to unlock: {rewardLabel}
              </p>
              <AdUnit
                placement="reward"
                config={config}
                adsenseClientId={adsenseClientId}
                adsenseReady={adsenseReady}
                width={240}
                height={200}
              />
              <button
                type="button"
                onClick={() => setClaimed(true)}
                className="w-full rounded-full bg-white px-3 py-1.5 text-center text-xs font-bold text-[#0b0c14]"
              >
                Claim reward
              </button>
            </div>
          ) : (
            <p className="text-center text-xs font-bold text-white">🎉 {rewardLabel} unlocked!</p>
          )}
        </Popover>
      )}
    </div>
  );
}
