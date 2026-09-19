/**
 * Base "bone" primitive for every loading skeleton in the app. One shared
 * shape so every loading.tsx shimmers in sync and stays visually consistent
 * with the glass/black theme (plain translucent-white blocks, no color) —
 * the animated sweep itself lives in the shared `.skeleton-bone` class in
 * globals.css, same diagonal-sweep language as `.shine-sweep`.
 */
export function Bone({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      aria-hidden
      style={style}
      className={`skeleton-bone rounded-md bg-white/10 ${className}`}
    />
  );
}

/** Circular bone — avatars, icon badges. */
export function CircleBone({ size, className = "" }: { size: number; className?: string }) {
  return (
    <div
      aria-hidden
      style={{ width: size, height: size }}
      className={`skeleton-bone shrink-0 rounded-full bg-white/10 ${className}`}
    />
  );
}

/** Wraps any block of bones with the right a11y semantics for a loading
 * region (visually it adds nothing — each bone already pulses on its own). */
export function SkeletonRoot({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" aria-label="Loading">
      {children}
    </div>
  );
}
