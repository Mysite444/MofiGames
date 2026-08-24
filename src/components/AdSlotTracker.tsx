"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { trackAdEvent, relativeClickPosition } from "@/lib/ad-tracking";

/** Wraps an ad slot placeholder with Ad Protection instrumentation:
 * fires one impression event the first time the slot is at least half
 * visible, and a click event (with heatmap x/y) on click. If the
 * tracking route reports this session/IP as blocked (Auto Ad Disable —
 * see migration 0024), the slot renders nothing rather than the
 * placeholder, matching what would happen once real ad code is dropped
 * in and simply isn't allowed to show. Fails soft: any tracking error
 * leaves the slot visible. */
export function AdSlotTracker({ placement, children }: { placement: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);
  const firedImpression = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !firedImpression.current) {
            firedImpression.current = true;
            trackAdEvent("impression", placement).then((result) => {
              if (result.blocked) setHidden(true);
            });
            observer.disconnect();
          }
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [placement]);

  function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    const { xPct, yPct } = relativeClickPosition(event);
    trackAdEvent("click", placement, { xPct, yPct }).then((result) => {
      if (result.blocked) setHidden(true);
    });
  }

  if (hidden) return null;

  return (
    <div ref={ref} onClick={handleClick}>
      {children}
    </div>
  );
}
