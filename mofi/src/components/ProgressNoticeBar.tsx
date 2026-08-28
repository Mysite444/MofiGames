"use client";

import Link from "next/link";

/**
 * The "Your progress won't be saved!" notice — shown on top of the game
 * screen itself, and only for signed-out visitors (see GamePlayerPanel,
 * which gates this on auth state — a signed-in account, guest sessions
 * included, already has this data written through to it, per
 * lib/game-library.ts). A full-width rectangular banner (edge-to-edge with
 * the game frame, not a floating pill), with a fully transparent background
 * so the game art shows through underneath it — white warning text (with a
 * soft drop-shadow for legibility) and buttons centered together as one
 * cluster rather than split to the edges. Slides in on mount with a soft
 * glow that breathes gently to keep it noticeable without being obnoxious.
 * Kept compact (~40px tall) so it doesn't eat into the game view.
 */
export function ProgressNoticeBar({ onClose }: { onClose: () => void }) {
  return (
    <div className="notice-bar-in notice-bar-glow flex w-full items-center justify-center gap-3 bg-transparent px-3.5 py-2 sm:px-4">
      <span className="truncate text-xs font-bold tracking-wide text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.85)] sm:text-sm">
        Your progress won&apos;t be saved!
      </span>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md border border-white/30 px-3 py-1 text-xs font-bold text-white transition-colors hover:bg-white/10 sm:text-sm"
        >
          Close
        </button>
        <Link
          href="/login"
          className="shrink-0 rounded-md bg-white px-3 py-1 text-xs font-bold text-[#0b0c14] transition-transform hover:brightness-95 active:scale-95 sm:text-sm"
        >
          Log in
        </Link>
      </div>
    </div>
  );
}
