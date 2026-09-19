/** Formats a raw play count into a compact display string, e.g.
 * 1_234_567 -> "1.2M", 4_500 -> "5K", 320 -> "320". */
export function formatPlays(plays: number): string {
  if (plays >= 1_000_000) return `${(plays / 1_000_000).toFixed(1)}M`;
  if (plays >= 1_000) return `${Math.round(plays / 1000)}K`;
  return String(plays);
}
