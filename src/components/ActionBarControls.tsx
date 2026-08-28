"use client";

/** Shared building blocks for the player action bar's icon buttons and
 * their popovers — split out of PlayerActionBar.tsx so other buttons
 * that live in the same bar (e.g. RewardAdButton) can reuse the exact
 * same look without importing PlayerActionBar itself (which would create
 * a circular import, since PlayerActionBar renders RewardAdButton). */

export function IconButton({
  children,
  active,
  onClick,
  label,
  ...rest
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  /** Hover/focus tooltip text, CrazyGames-style (small dark pill with a
   * pointer arrow, fading in just above the button — see the "Mute" tooltip
   * on crazygames.com). Every icon button gets one except like/dislike,
   * which already carry their own visible label. Omit (or pass undefined)
   * to suppress it — used while this button's own popover is open, so the
   * tooltip doesn't stack on top of the popover. */
  label?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <div className="group/tip relative flex">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`flex h-8 w-8 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/15 ${
          active ? "text-white" : "text-white/90"
        }`}
        {...rest}
      >
        {children}
      </button>
      {label && <IconButtonTooltip>{label}</IconButtonTooltip>}
    </div>
  );
}

/** The floating label itself — absolutely positioned above whichever
 * IconButton it's rendered inside, invisible until that button's
 * `group/tip` wrapper is hovered or focused. */
function IconButtonTooltip({ children }: { children: React.ReactNode }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-md bg-[#0b0c14] px-2 py-1 text-[11px] font-semibold text-white opacity-0 shadow-lg shadow-black/40 transition-all duration-150 group-hover/tip:translate-y-0 group-hover/tip:opacity-100 group-focus-within/tip:translate-y-0 group-focus-within/tip:opacity-100">
      {children}
      <span className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-4 border-transparent border-t-[#0b0c14]" />
    </span>
  );
}

export function Popover({
  children,
  onClose,
  align = "left",
  solidBlack = false,
}: {
  children: React.ReactNode;
  onClose: () => void;
  align?: "left" | "right";
  /** Renders a plain opaque black panel instead of the usual frosted-glass
   * look — used by the "Game controls" popover so its key list stays fully
   * legible over the game frame instead of the page's colors bleeding
   * through. */
  solidBlack?: boolean;
}) {
  return (
    <>
      {/* Click-outside catcher */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default"
      />
      <div
        className={`${solidBlack ? "bg-black border border-white/18 shadow-2xl" : "glass-strong shadow-2xl"} absolute bottom-full z-50 mb-2 w-56 rounded-xl p-3 ${
          align === "right" ? "right-0" : "left-1/2 -translate-x-1/2"
        }`}
      >
        {children}
      </div>
    </>
  );
}
