/** Custom "framed list + arrow" glyph matching CrazyGames' desktop sidebar
 * toggle button (see reference screenshot). Not a lucide icon — lucide has
 * nothing with this framed/arrow-overlay look, so it's hand-drawn on a
 * standard 24x24 grid to stay crisp at the sizes lucide icons use elsewhere
 * in the header.
 *
 * The arrow flips with `pointingRight` so it always hints at *where the
 * sidebar will go*: left (collapse) while the sidebar is open, right
 * (expand) once it's hidden. */
export function SidebarToggleIcon({
  pointingRight = false,
  size = 20,
  className,
}: {
  pointingRight?: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{
        transform: pointingRight ? "scaleX(-1)" : undefined,
        transition: "transform 0.2s ease",
      }}
      aria-hidden="true"
    >
      <rect x="2.75" y="2.75" width="18.5" height="18.5" rx="4" strokeWidth={2} />
      <line x1="5.75" y1="8" x2="15.25" y2="8" strokeWidth={3} />
      <line x1="5.75" y1="12" x2="9.25" y2="12" strokeWidth={3} />
      <line x1="5.75" y1="16" x2="15.25" y2="16" strokeWidth={3} />
      <path d="M15.75 9 L15.75 15 L10 12 Z" fill="currentColor" stroke="none" />
    </svg>
  );
}
