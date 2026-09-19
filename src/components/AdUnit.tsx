"use client";

import { useEffect, useRef } from "react";
import { AdSlotTracker } from "@/components/AdSlotTracker";

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

export interface AdPlacementConfig {
  enabled: boolean;
  slotId: string | null;
  code: string | null;
}

/**
 * Single shared renderer behind every ad placement (Header, Sidebar,
 * In-Game, Footer, Sticky, Reward, Custom HTML) — reads one placement's
 * slice of Admin → Monetization → Advertisement Management and renders,
 * in priority order:
 *   1. Nothing, if the placement is toggled off.
 *   2. The admin's pasted "Custom code" verbatim, with embedded <script>
 *      tags re-created so the browser actually executes them (React's
 *      dangerouslySetInnerHTML does not run injected <script> tags).
 *   3. A standard AdSense <ins class="adsbygoogle"> unit, if a slot id
 *      is set and the global AdSense loader is actually on the page.
 *   4. A dashed placeholder box (same look every slot used before this
 *      was wired up) — enabled but nothing configured yet, so an admin
 *      can still see exactly where this placement sits on the page.
 * Wrapped in AdSlotTracker so Ad Protection (impressions/clicks, and
 * auto-hiding for a flagged session) keeps working exactly as before.
 */
export function AdUnit({
  placement,
  config,
  adsenseClientId,
  adsenseReady,
  width,
  height,
  className,
}: {
  /** Tracking key sent to Ad Protection — kept distinct per placement. */
  placement: string;
  config: AdPlacementConfig;
  /** Publisher client id from Admin → AdSense — required to render a
   * slot-id-based <ins> unit. */
  adsenseClientId?: string | null;
  /** Whether the global AdSense loader script is actually on the page
   * (adsense_enabled + client id both set) — an <ins> unit with no
   * loader present would just sit blank, so this falls back to the
   * placeholder instead in that case. */
  adsenseReady?: boolean;
  width: number;
  height: number;
  className?: string;
}) {
  if (!config.enabled) return null;

  return (
    <AdSlotTracker placement={placement}>
      <AdUnitContent
        config={config}
        adsenseClientId={adsenseClientId}
        adsenseReady={adsenseReady}
        width={width}
        height={height}
        className={className}
      />
    </AdSlotTracker>
  );
}

function AdUnitContent({
  config,
  adsenseClientId,
  adsenseReady,
  width,
  height,
  className,
}: {
  config: AdPlacementConfig;
  adsenseClientId?: string | null;
  adsenseReady?: boolean;
  width: number;
  height: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasCustomCode = Boolean(config.code && config.code.trim());
  const hasAdsenseSlot = Boolean(!hasCustomCode && adsenseReady && adsenseClientId && config.slotId);

  // Custom code path: manually rebuild the fragment so any <script> tags
  // inside it actually execute (innerHTML/dangerouslySetInnerHTML never
  // runs scripts — this is the standard workaround for injecting
  // third-party ad tags at runtime).
  useEffect(() => {
    if (!hasCustomCode || !containerRef.current || !config.code) return;
    const container = containerRef.current;
    container.innerHTML = "";
    const template = document.createElement("template");
    template.innerHTML = config.code.trim();
    const fragment = template.content;
    fragment.querySelectorAll("script").forEach((oldScript) => {
      const newScript = document.createElement("script");
      Array.from(oldScript.attributes).forEach((attr) => newScript.setAttribute(attr.name, attr.value));
      newScript.textContent = oldScript.textContent;
      oldScript.replaceWith(newScript);
    });
    container.appendChild(fragment);
  }, [hasCustomCode, config.code]);

  // AdSense slot-id path: ask the already-loaded adsbygoogle.js to fill
  // the <ins> unit rendered below.
  useEffect(() => {
    if (!hasAdsenseSlot) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // Loader not ready yet, or this unit already got filled — safe to ignore.
    }
  }, [hasAdsenseSlot]);

  if (hasCustomCode) {
    return <div ref={containerRef} className={className} style={{ width, height }} />;
  }

  if (hasAdsenseSlot) {
    return (
      <ins
        className={`adsbygoogle ${className ?? ""}`}
        style={{ display: "block", width, height }}
        data-ad-client={adsenseClientId ?? undefined}
        data-ad-slot={config.slotId ?? undefined}
      />
    );
  }

  return (
    <div
      className={`flex shrink-0 flex-col items-center justify-center gap-1 border border-dashed border-white/15 bg-white/[0.03] ${className ?? ""}`}
      style={{ width, height }}
    >
      <span className="text-[11px] font-semibold uppercase tracking-wide text-text-faint">Advertisement</span>
      <span className="text-[11px] text-text-faint/70">
        {width} × {height}
      </span>
    </div>
  );
}
