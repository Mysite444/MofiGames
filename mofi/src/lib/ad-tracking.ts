import { getOrCreateVisitorId } from "@/lib/visitor-id";

interface TrackResult {
  blocked: boolean;
  reason?: string;
}

/** Fires one impression or click at POST /api/ads/track for the given
 * placement (see src/app/api/ads/track/route.ts). Fails soft — a broken
 * or slow beacon should never delay or break the ad slot itself, so this
 * always resolves (never rejects) and defaults to `{ blocked: false }` on
 * any failure. `xPct`/`yPct` are the click's position within the slot
 * (0-100), used for the Click Heatmap. */
export async function trackAdEvent(
  eventType: "impression" | "click",
  placement: string,
  options?: { xPct?: number; yPct?: number }
): Promise<TrackResult> {
  try {
    const visitorId = getOrCreateVisitorId();
    const res = await fetch("/api/ads/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        eventType,
        placement,
        path: window.location.pathname,
        visitorId,
        xPct: options?.xPct,
        yPct: options?.yPct,
      }),
    });
    if (!res.ok) return { blocked: false };
    const json = (await res.json()) as TrackResult;
    return { blocked: Boolean(json.blocked), reason: json.reason };
  } catch {
    return { blocked: false };
  }
}

/** Relative (x, y) position, 0-100, of a click within the element it
 * landed on — for the Click Heatmap. */
export function relativeClickPosition(event: { clientX: number; clientY: number; currentTarget: EventTarget | null }): {
  xPct: number;
  yPct: number;
} {
  const el = event.currentTarget as HTMLElement | null;
  if (!el || typeof el.getBoundingClientRect !== "function") return { xPct: 50, yPct: 50 };
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return { xPct: 50, yPct: 50 };
  const xPct = Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100));
  const yPct = Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100));
  return { xPct, yPct };
}
