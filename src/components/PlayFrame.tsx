"use client";

import { useState } from "react";
import { Code2 } from "lucide-react";
import { iconMap } from "@/lib/icon-map";
import { HoverPreviewVideo } from "./HoverPreviewVideo";
import { useMediaSessionCleanup } from "@/lib/use-media-session-cleanup";
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
  coverImageUrl,
  previewVideoUrl,
  orientation = "landscape",
  iframeRef,
  onIframeLoad,
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
  /** Static cover image shown as the resting state of the "not playing
   * yet" panel — the game's own artwork instead of the bare gradient.
   * Source: getGameCover(game, …) in the caller. */
  coverImageUrl?: string;
  /** Short, silent, looping clip revealed over the cover image ONLY
   * while the visitor's cursor is over the frame — the same
   * hover-preview behavior as the homepage game cards (see
   * HoverPreviewVideo, which this delegates to, so any direct MP4/WebM
   * *or* YouTube link works here exactly like it does on a card).
   * Completely independent of the trailer: `videoTrailerUrl` is never
   * read here at all — it only ever renders in the dedicated "Trailer"
   * section further down the game page (GameDetailsSection).
   * Source: Admin → Edit Game → "Preview Video" field. */
  previewVideoUrl?: string;
  /** Portrait games get letterboxed and rotated to fit a landscape
   * container so they aren't stretched sideways — the "orientation…
   * automatically rotate according to game need" behavior. Has no visual
   * effect for landscape games (the default). */
  orientation?: "landscape" | "portrait";
  /** Ref onto the underlying game iframe — lets the caller (GamePlayerPanel)
   * reach into `contentWindow` to broadcast the mute postMessage contract.
   * See lib/use-embed-mute.ts for why this is necessary: a cross-origin
   * iframe can't be muted any other way from the parent page. */
  iframeRef?: React.Ref<HTMLIFrameElement>;
  /** Fires on the iframe's native `load` event — used to re-broadcast the
   * current mute state once the game has actually finished initialising
   * (see lib/use-embed-mute.ts). */
  onIframeLoad?: () => void;
}) {
  const [playingState, setPlayingState] = useState(false);
  const [hovering, setHovering] = useState(false);
  const playing = playingProp ?? playingState;
  const Icon = iconMap[category.icon];

  // Resets the browser's Media Session on unmount (leaving the game page
  // via client-side navigation) and on visibilitychange → hidden (tab
  // switched away from or closed) — fixes the persistent Android Chrome
  // media-notification bar left behind after playing a game. See
  // lib/use-media-session-cleanup.ts for the full explanation.
  useMediaSessionCleanup();

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
        <div
          className="absolute inset-0"
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
        >
          {/*
           * "Not playing yet" panel — two independent layers:
           * 1. Resting state: the game's own cover image (coverImageUrl),
           *    always visible. No video plays here until the visitor
           *    actually hovers — this is the "image, not autoplaying
           *    video" behavior for the desktop game post.
           * 2. Hover state: previewVideoUrl fades in over the cover image
           *    only while `hovering` is true, exactly like a homepage
           *    game card (delegates to the same HoverPreviewVideo, so
           *    both raw MP4/WebM and YouTube links work here). The
           *    trailer field is never involved in this panel at all.
           * The category gradient set on the outer container is the
           * final fallback when neither a cover nor a preview clip exists.
           */}
          {coverImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverImageUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}

          {previewVideoUrl && (
            <HoverPreviewVideo src={previewVideoUrl} active={hovering} />
          )}

          <button
            type="button"
            onClick={startPlaying}
            className="group absolute inset-0 flex items-center justify-center bg-black/10 transition-colors hover:bg-black/25"
          >
            <span
              className="rounded-full px-9 py-3.5 text-lg font-extrabold tracking-wide text-white shadow-xl transition-transform group-hover:scale-105"
              style={{
                background: "var(--color-cta-blue)",
                boxShadow:
                  "0 4px 20px rgba(var(--color-cta-blue-rgb), 0.35), 0 2px 8px rgba(0,0,0,0.3)",
              }}
            >
              Play
            </span>
          </button>
        </div>
      ) : playUrl ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <iframe
            ref={iframeRef}
            src={playUrl}
            title={title ?? "Game"}
            className={
              orientation === "portrait"
                ? "aspect-[9/16] h-full max-w-full border-0"
                : "h-full w-full border-0"
            }
            // NOTE on Media Session: there is no Permissions-Policy /
            // iframe `allow` directive for "media session" (it isn't a
            // policy-controlled feature — see MDN's Permissions-Policy
            // directive list), so it can't be scoped down here the way
            // autoplay/fullscreen/gamepad are. Cross-origin isolation
            // already keeps this game's `navigator.mediaSession` writes
            // confined to its own document; the actual fix for the stuck
            // notification is clearing THIS page's own Media Session,
            // done above via useMediaSessionCleanup().
            allow="gamepad *; fullscreen *; autoplay *"
            allowFullScreen
            onLoad={onIframeLoad}
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
