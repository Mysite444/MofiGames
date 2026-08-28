"use client";

import { useState } from "react";
import {
  ThumbsUp,
  ThumbsDown,
  Bookmark,
  Cloud,
  CloudOff,
  MessageSquare,
  Gamepad2,
  Smartphone,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  EyeOff,
  ExternalLink,
  LogIn,
  CheckCircle2,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import Link from "next/link";
import { Logo } from "./Logo";
import { SITE_URL } from "@/lib/seo";
import { formatPlays } from "@/lib/format-plays";
import { toggleFavorite, useIsFavorited } from "@/lib/game-library";
import { getControlsList } from "@/lib/game-controls";
import { IconButton, Popover as PopoverPanel } from "@/components/ActionBarControls";
import { RewardAdButton } from "@/components/RewardAdButton";
import { useAuth } from "@/lib/auth-context";
import type { AdPlacementConfig } from "@/components/AdUnit";

type Popover = "qr" | "feedback" | "save" | "controls" | null;

/**
 * The action bar that sits under the player (and again, mirrored, along the
 * bottom of the fullscreen overlay) — logo, like/dislike, favorite, account
 * save-state, feedback, in-game controls, mobile QR code, sound, and
 * fullscreen. Same nine buttons in both places, just the left side swaps
 * between the site logo and the logo + game title + "Hide this bar".
 *
 * Like/dislike/sound are optimistic, local-only UI — there's no backend yet
 * to actually persist any of it (same as the mobile action row). Favorite
 * is real, though — it's backed by localStorage via lib/game-library.ts and
 * feeds the /favorites page.
 */
export function PlayerActionBar({
  variant,
  gameId,
  gameTitle,
  gamePath,
  basePlays,
  controls,
  isFullscreen,
  onToggleFullscreen,
  onHideBar,
  fullscreenEnabled = true,
  saveProgressEnabled = true,
  rewardAds,
  adsenseClientId,
  adsenseReady,
}: {
  variant: "inline" | "fullscreen";
  /** The game's slug — used as the favorite-tracking key. */
  gameId: string;
  gameTitle: string;
  /** Relative path to the game, e.g. /game/some-slug — used to build the
   * absolute URL encoded into the "play on mobile" QR code. */
  gamePath: string;
  basePlays: number;
  /** Admin → Games → edit a game → Controls field (one control per line).
   * Powers the "Game controls" popover on the play screen itself — falls
   * back to a generic control scheme when unset, same as the Controls
   * section further down the game page (see lib/game-controls.ts). */
  controls?: string;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  /** Only used in the fullscreen variant — collapses the whole bar. */
  onHideBar?: () => void;
  /** Set from the game's `fullscreen_enabled` admin field — hides the
   * fullscreen control entirely for games that shouldn't offer it. */
  fullscreenEnabled?: boolean;
  /** Set from the game's `save_progress_enabled` admin field — hides the
   * Save Progress button for embed games that handle saving internally.
   * Defaults to true (visible) to preserve existing behaviour. */
  saveProgressEnabled?: boolean;
  /** Admin → Monetization → Advertisement Management → Reward Ads.
   * Omitted (or disabled) hides the gift button entirely. */
  rewardAds?: AdPlacementConfig & { rewardLabel: string };
  adsenseClientId?: string | null;
  adsenseReady?: boolean;
}) {
  const { user } = useAuth();
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const favorited = useIsFavorited(gameId);
  const [muted, setMuted] = useState(false);
  const [popover, setPopover] = useState<Popover>(null);

  // Save Progress button state: signed-in users have progress saved
  // automatically (lib/game-library records every play); signed-out visitors
  // need to log in for it to persist beyond their current session.
  const progressSaved = Boolean(user);

  const baseLikes = Math.round(basePlays * 0.92);
  const controlsList = getControlsList({ controls });
  // Build the canonical QR URL from SITE_URL (the same source used for
  // sitemaps and SEO meta tags) — this guarantees we always encode a full
  // "https://…" URL regardless of whether window is available (SSR) and
  // prevents the relative-path / clipboard-copy bug described below.
  const qrUrl = `${SITE_URL}${gamePath}`;

  function togglePopover(p: Popover) {
    setPopover((cur) => (cur === p ? null : p));
  }

  return (
    <div className="relative flex w-full shrink-0 items-center justify-between gap-2 bg-[var(--color-menu-bg)] px-3 py-2">
      {/* Left side: site logo (inline) or logo + game title + Hide this bar (fullscreen) */}
      {variant === "inline" ? (
        <Logo collapsed />
      ) : (
        <div className="flex min-w-0 items-center gap-3">
          <Logo collapsed />
          <span className="truncate font-display text-sm font-bold text-white sm:text-base">
            {gameTitle}
          </span>
        </div>
      )}

      {variant === "fullscreen" && (
        <button
          type="button"
          onClick={onHideBar}
          className="glass-strong flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-white/15"
        >
          <EyeOff size={14} />
          Hide this bar
        </button>
      )}

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => setVote((v) => (v === "up" ? null : "up"))}
          aria-pressed={vote === "up"}
          aria-label="Like"
          className={`flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold transition-colors hover:bg-white/15 ${
            vote === "up" ? "text-gold" : "text-white"
          }`}
        >
          <ThumbsUp size={15} className={vote === "up" ? "fill-gold" : ""} />
          {formatPlays(baseLikes + (vote === "up" ? 1 : 0))}
        </button>

        <IconButton
          aria-label="Dislike"
          active={vote === "down"}
          onClick={() => setVote((v) => (v === "down" ? null : "down"))}
        >
          <ThumbsDown size={15} className={vote === "down" ? "fill-hot text-hot" : ""} />
        </IconButton>

        <IconButton
          aria-label={favorited ? "Remove bookmark" : "Bookmark game"}
          label={favorited ? "Bookmarked" : "Bookmark"}
          active={favorited}
          onClick={() => toggleFavorite(gameId)}
        >
          <Bookmark size={15} className={favorited ? "fill-[#3DA9FC] text-[#3DA9FC]" : ""} />
        </IconButton>

        {saveProgressEnabled && (
          <div className="relative">
            <IconButton
              aria-label={progressSaved ? "Progress is being saved" : "Save progress — log in required"}
              label={progressSaved ? "Progress saved" : "Log in to save"}
              active={popover === "save"}
              onClick={() => togglePopover("save")}
            >
              {progressSaved ? (
                <Cloud size={16} className="text-[#34D399]" />
              ) : (
                <span className="relative flex items-center justify-center">
                  <Cloud size={16} className="fill-hot text-hot" />
                  <span className="absolute top-[3px] text-[7px] font-black leading-none text-white">!</span>
                </span>
              )}
            </IconButton>

            {popover === "save" && (
              <PopoverPanel onClose={() => setPopover(null)}>
                {progressSaved ? (
                  <>
                    <div className="mb-2 flex items-center gap-2">
                      <CheckCircle2 size={15} className="shrink-0 text-[#34D399]" />
                      <p className="text-xs font-bold text-white">Progress is being saved</p>
                    </div>
                    <p className="text-xs text-text-muted">
                      Your play history and favourites are synced to your account and will be here
                      when you come back.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="mb-2 flex items-center gap-2">
                      <CloudOff size={15} className="shrink-0 text-hot" />
                      <p className="text-xs font-bold text-white">Progress won&apos;t be saved</p>
                    </div>
                    <p className="text-xs text-text-muted">
                      Log in or create a free account to save your play history and favourites
                      across devices.
                    </p>
                    <Link
                      href="/login"
                      className="mt-2.5 flex items-center justify-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-center text-xs font-bold text-[#0b0c14] transition-opacity hover:opacity-90"
                    >
                      <LogIn size={12} />
                      Log in to save progress
                    </Link>
                  </>
                )}
              </PopoverPanel>
            )}
          </div>
        )}

        <div className="relative">
          <IconButton
            aria-label="Send feedback"
            label={popover === "feedback" ? undefined : "Send feedback"}
            active={popover === "feedback"}
            onClick={() => togglePopover("feedback")}
          >
            <span className="relative flex items-center justify-center">
              <MessageSquare size={15} />
              <span className="absolute top-[4px] text-[8px] font-black leading-none">!</span>
            </span>
          </IconButton>
          {popover === "feedback" && (
            <PopoverPanel onClose={() => setPopover(null)}>
              <p className="text-xs font-bold text-white">Need help?</p>
              <p className="mt-1 text-xs text-text-muted">
                Spotted a bug or have feedback on this game? Let us know.
              </p>
              <Link
                href="/contact"
                className="mt-2 block rounded-full bg-white px-3 py-1.5 text-center text-xs font-bold text-[#0b0c14]"
              >
                Send feedback
              </Link>
            </PopoverPanel>
          )}
        </div>

        <div className="relative">
          <IconButton
            aria-label="Game controls"
            label={popover === "controls" ? undefined : "Game controls"}
            active={popover === "controls"}
            onClick={() => togglePopover("controls")}
          >
            <Gamepad2 size={16} />
          </IconButton>
          {popover === "controls" && (
            <PopoverPanel onClose={() => setPopover(null)} solidBlack>
              <p className="mb-2 text-xs font-bold text-white">Controls</p>
              <ul className="flex flex-col gap-1.5 text-xs text-text-muted">
                {controlsList.map((c) => (
                  <li key={c} className="flex items-start gap-2">
                    <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-text-faint" />
                    {c}
                  </li>
                ))}
              </ul>
            </PopoverPanel>
          )}
        </div>

        <div className="relative">
          <IconButton
            aria-label="Play on mobile"
            label={popover === "qr" ? undefined : "Play on mobile"}
            active={popover === "qr"}
            onClick={() => togglePopover("qr")}
          >
            <Smartphone size={15} />
          </IconButton>
          {popover === "qr" && (
            <PopoverPanel onClose={() => setPopover(null)} align="right">
              <p className="mb-2 text-center text-xs font-bold text-white">Scan to play on mobile</p>
              <div className="flex items-center justify-center rounded-lg bg-white p-2">
                <QRCodeSVG value={qrUrl} size={112} />
              </div>
              <a
                href={qrUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 flex items-center justify-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-center text-xs font-bold text-[#0b0c14] transition-colors hover:bg-white/90"
              >
                <ExternalLink size={12} />
                Visit Link
              </a>
            </PopoverPanel>
          )}
        </div>

        <IconButton
          aria-label={muted ? "Unmute" : "Mute"}
          label={muted ? "Unmute" : "Mute"}
          onClick={() => setMuted((m) => !m)}
        >
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </IconButton>

        {rewardAds && (
          <RewardAdButton
            config={rewardAds}
            rewardLabel={rewardAds.rewardLabel}
            adsenseClientId={adsenseClientId}
            adsenseReady={adsenseReady}
          />
        )}

        {fullscreenEnabled && (
          <IconButton
            aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            onClick={onToggleFullscreen}
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </IconButton>
        )}
      </div>
    </div>
  );
}
