"use client";

import { useState } from "react";
import { Code2, Play as PlayIcon } from "lucide-react";
import { iconMap } from "@/lib/icon-map";
import type { Category } from "@/lib/types";

export function PlayFrame({
  category,
  bleed = false,
  vignette = false,
  heightClassName = "aspect-video",
  heightStyle,
  playing: playingProp,
  onPlay,
  playUrl,
  title,
  previewVideoUrl,
  coverImageUrl,
  orientation = "landscape",
}: {
  category: Category;
  /** Edge-to-edge, no rounding/ring. */
  bleed?: boolean;
  /** Soft inset shadow instead of a hard ring border, so the frame's edges
   * blend into the surrounding black rather than cutting off sharply
   * (the mobile game-page hero look). */
  vignette?: boolean;
  /** Aspect/height utility classes for the frame. Defaults to the original 16:9. */
  heightClassName?: string;
  /** Explicit fixed CSS height (e.g. "min(684px, calc(100vh - 210px))").
   * When set, this wins over heightClassName's aspect-ratio and becomes
   * the frame's real height — used so the frame's width can change
   * (e.g. get wider) without ever recalculating/affecting the height. */
  heightStyle?: string;
  /** Pass these two together to drive play state from an external button
   * (e.g. a "Play now" CTA below the frame). Omit both for the original
   * self-contained behavior (desktop game page). */
  playing?: boolean;
  onPlay?: () => void;
  /** Real game's playable URL (embed_url, or the public URL of an
   * uploaded build's entry file). When set, an actual iframe renders
   * instead of the "placeholder" panel. */
  playUrl?: string;
  /** Used as the iframe's accessible title. */
  title?: string;
  /** Short, silent, looping clip shown as the background of the "not
   * playing yet" state — the CrazyGames-style preview-video behavior.
   * Sits behind the play button (still clickable) and is skipped
   * entirely once the iframe/build starts. */
  previewVideoUrl?: string;
  /** The game's real cover/thumbnail image (landscape cover, falling back
   * to thumbnail/cover-image — see lib/game-cover.ts). Shown full-bleed
   * behind the Play button in the "not playing yet" state — the actual
   * CrazyGames behavior, where you see the real game art before hitting
   * Play, not just a gradient placeholder. Omit to fall back to the
   * category gradient + icon (e.g. games with no uploaded art yet). */
  coverImageUrl?: string;
  /** Portrait games get letterboxed and rotated to fit a landscape
   * container so they aren't stretched sideways — the "orientation…
   * automatically rotate according to game need" behavior. Has no visual
   * effect for landscape games (the default). */
  orientation?: "landscape" | "portrait";
}) {
  const [playingState, setPlayingState] = useState(false);
  const playing = playingProp ?? playingState;
  const Icon = iconMap[category.icon];

  function startPlaying() {
    setPlayingState(true);
    onPlay?.();
  }

  const edgeClasses = bleed
    ? ""
    : vignette
      ? "shadow-[inset_0_0_60px_20px_rgba(0,0,0,0.95)]"
      : "";

  return (
    <div
      className={`relative w-full overflow-hidden ${heightClassName} ${edgeClasses}`}
      style={{
        background: `linear-gradient(135deg, ${category.colorTo}, ${category.colorFrom})`,
        // A concrete height value beats the CSS aspect-ratio the
        // heightClassName may set (aspect-ratio only fills in a dimension
        // left "auto" — with an explicit height here, width and height
        // are both explicit, so the ratio class becomes a no-op for
        // height and this is the number that actually renders).
        ...(heightStyle ? { height: heightStyle } : {}),
      }}
    >
      <Icon
        size={220}
        strokeWidth={1}
        className="pointer-events-none absolute -right-8 -bottom-10 text-white/10"
        aria-hidden
      />

      {!playing ? (
        <>
          {coverImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverImageUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          {previewVideoUrl && (
            <video
              src={previewVideoUrl}
              autoPlay
              muted
              loop
              playsInline
              preload="none"
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          {/* Scrim so the white play button and label stay legible over any
           * cover art / preview clip, same as CrazyGames' darkened poster. */}
          <div className="absolute inset-0 bg-black/25" aria-hidden />
          <button
            type="button"
            onClick={startPlaying}
            aria-label={title ? `Play ${title}` : "Play"}
            className="group absolute inset-0 flex flex-col items-center justify-center gap-3 transition-colors hover:bg-black/10"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-xl transition-transform group-hover:scale-110 group-active:scale-95 sm:h-20 sm:w-20">
              <PlayIcon
                size={32}
                className="ml-1 fill-[#0b0c14] text-[#0b0c14]"
                strokeWidth={0}
              />
            </span>
            <span className="rounded-full bg-black/40 px-4 py-1 text-sm font-bold tracking-wide text-white backdrop-blur-sm">
              Play
            </span>
          </button>
        </>
      ) : playUrl ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <iframe
            src={playUrl}
            title={title ?? "Game"}
            className={
              orientation === "portrait"
                ? "aspect-[9/16] h-full max-w-full border-0"
                : "h-full w-full border-0"
            }
            allow="gamepad *; fullscreen *; autoplay *"
            allowFullScreen
          />
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 px-6 text-center backdrop-blur-sm">
          <Code2 size={28} className="text-white/80" />
          <p className="max-w-sm text-sm font-medium text-white">
            This is where the real game embed (iframe / canvas / WebGL build) goes.
          </p>
          <p className="max-w-sm text-xs text-white/70">
            Front-end placeholder — swap this panel for your game player.
          </p>
        </div>
      )}
    </div>
  );
}
