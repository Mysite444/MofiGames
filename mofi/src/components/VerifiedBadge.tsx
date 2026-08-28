/**
 * Small blue "verified" checkmark — shown next to a MofiGames admin's
 * name (e.g. in comments) to distinguish official replies from regular
 * players. A self-contained two-tone SVG rather than a stroke-only icon
 * (like lucide's BadgeCheck) so the solid-blue-badge / white-check look
 * is exact, instead of depending on how a particular icon's paths happen
 * to fill vs. stroke.
 */
export function VerifiedBadge({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      role="img"
      aria-label="Verified MofiGames admin"
    >
      <circle cx="12" cy="12" r="10" fill="#3DA9FC" />
      <path
        d="M7.5 12.6l2.8 2.8 6.2-6.8"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
