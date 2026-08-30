"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronUp } from "lucide-react";
import { PlayFrame } from "./PlayFrame";
import { ProgressNoticeBar } from "./ProgressNoticeBar";
import { PlayerActionBar } from "./PlayerActionBar";
import { InGameInterstitial } from "./InGameInterstitial";
import { recordPlayed, usePlayTimeTracking } from "@/lib/game-library";
import { shouldShowInGameAd } from "@/lib/ingame-ad-frequency";
import { useAuth } from "@/lib/auth-context";
import type { AdPlacementConfig } from "./AdUnit";
import type { Category, Game } from "@/lib/types";

/**
 * Desktop game player: play frame (with the "progress won't be saved"
 * notice floating on top of it, CrazyGames-style — shown only to signed-out
 * visitors, since a signed-in account, guest sessions included, already
 * saves this data — see lib/game-library.ts) + action bar, wired to the
 * real browser Fullscreen API. Clicking the fullscreen button fullscreens
 * this whole panel; the action bar then swaps to the "Hide this bar" /
 * logo + title layout from the fullscreen reference.
 *
 * The frame fills the width of its column up to the ceiling set by the
 * wrapper in page.tsx (GAME_FRAME_MAX_WIDTH there). Height is a separate,
 * fixed value passed in via `frameHeight` (GAME_FRAME_HEIGHT in page.tsx) —
 * clamped to whatever the visitor's real viewport has room for so the ad
 * below stays visible without scrolling — and is intentionally independent
 * of width, so widening the frame never changes its height.
 */
export function GamePlayerPanel({
  game,
  category,
  adSlot,
  frameHeight,
  inGameAds,
  rewardAds,
  adsenseClientId,
  adsenseReady,
}: {
  game: Game;
  category: Category;
  adSlot?: React.ReactNode;
  /** Fixed CSS height for the non-fullscreen frame (e.g. "min(684px, ...)").
   * Passed in from page.tsx rather than derived here, so the frame's height
   * stays pinned to this exact value no matter how wide the frame itself
   * gets — width and height are fully independent. */
  frameHeight?: string;
  /** Admin → Monetization → Advertisement Management → In-Game Ads.
   * When enabled, shows a full-frame interstitial over the player every
   * `frequency` plays, before the game itself actually starts. Omitted
   * (or disabled) means Play always starts the game immediately. */
  inGameAds?: AdPlacementConfig & { frequency: number };
  /** Admin → Monetization → Advertisement Management → Reward Ads —
   * forwarded to the action bar's gift button. */
  rewardAds?: AdPlacementConfig & { rewardLabel: string };
  adsenseClientId?: string | null;
  adsenseReady?: boolean;
}) {
  const { user, ready } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [noticeVisible, setNoticeVisible] = useState(true);
  const [barHidden, setBarHidden] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [interstitialVisible, setInterstitialVisible] = useState(false);

  // Real playtime tracking — see lib/game-library.ts. Streams actual
  // elapsed seconds to the signed-in account while `playing` is true.
  usePlayTimeTracking(playing);



  // Signed-in visitors (including guest/anonymous sessions — see
  // lib/game-library.ts) already have their progress-adjacent data written
  // through to their account, so the "won't be saved" warning is only
  // relevant to fully signed-out visitors. Derived directly from auth state
  // on every render (rather than synced via an effect), so it also
  // disappears immediately if someone logs in mid-session.
  const showNotice = ready && !user && noticeVisible;

  useEffect(() => {
    function handleChange() {
      const active = document.fullscreenElement === containerRef.current;
      setIsFullscreen(active);
      if (!active) setBarHidden(false);
    }
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  async function toggleFullscreen() {
    if (game.fullscreenEnabled === false) return;
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await containerRef.current.requestFullscreen();
    }
  }

  function handlePlay() {
    recordPlayed(game.slug);
    if (inGameAds?.enabled && shouldShowInGameAd(inGameAds.frequency)) {
      setInterstitialVisible(true);
      return;
    }
    setPlaying(true);
  }

  function handleInterstitialContinue() {
    setInterstitialVisible(false);
    setPlaying(true);
  }

  return (
    <div
      ref={containerRef}
      className={
        isFullscreen
          ? "fixed inset-0 z-[999] flex flex-col bg-black"
          : "flex flex-col"
      }
    >
      <div
        className={isFullscreen ? "relative min-h-0 flex-1" : "relative w-full"}
      >
        <PlayFrame
          category={category}
          bleed={isFullscreen}
          heightClassName={isFullscreen ? "h-full" : ""}
          heightStyle={isFullscreen ? undefined : frameHeight}
          playing={playing}
          onPlay={handlePlay}
          playUrl={game.playUrl}
          previewVideoUrl={game.previewVideoUrl}
          orientation={game.orientation}
          title={game.title}
        />

        {showNotice && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10">
            <div className="pointer-events-auto">
              <ProgressNoticeBar onClose={() => setNoticeVisible(false)} />
            </div>
          </div>
        )}

        {interstitialVisible && inGameAds && (
          <InGameInterstitial
            config={inGameAds}
            adsenseClientId={adsenseClientId}
            adsenseReady={adsenseReady}
            onContinue={handleInterstitialContinue}
          />
        )}
      </div>

      {!barHidden && (
        <div className={isFullscreen ? undefined : "w-full"}>
          <PlayerActionBar
            variant={isFullscreen ? "fullscreen" : "inline"}
            gameId={game.slug}
            gameTitle={game.title}
            gamePath={`/${game.slug}`}
            basePlays={game.plays}
            controls={game.controls}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            onHideBar={() => setBarHidden(true)}
            fullscreenEnabled={game.fullscreenEnabled !== false}
            saveProgressEnabled={game.saveProgressEnabled !== false}
            rewardAds={rewardAds}
            adsenseClientId={adsenseClientId}
            adsenseReady={adsenseReady}
          />
        </div>
      )}

      {!isFullscreen && adSlot && <div className="mt-2">{adSlot}</div>}

      {isFullscreen && barHidden && (
        <button
          type="button"
          onClick={() => setBarHidden(false)}
          aria-label="Show bar"
          className="glass-strong absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full p-1.5 text-white hover:bg-white/15"
        >
          <ChevronUp size={16} />
        </button>
      )}
    </div>
  );
}
