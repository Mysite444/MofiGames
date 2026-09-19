"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { fetchAdProtectionHeatmap, type AdProtectionHeatmap } from "@/lib/supabase/admin-content";

/** Admin → Monetization → Ad Protection → Click Heatmap. Buckets the last
 * 30 days of click x/y coordinates (relative position within the slot)
 * into a 10x10 grid per placement. A click density concentrated in one
 * unnatural corner, or scattered uniformly with no relation to the
 * visible ad content, is a classic invalid-click tell. See
 * /api/admin/ads/protection/heatmap. */
export function AdProtectionHeatmapAdminClient() {
  const [placement, setPlacement] = useState<string | undefined>(undefined);
  const [data, setData] = useState<AdProtectionHeatmap | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p?: string) => {
    setError(null);
    try {
      const result = await fetchAdProtectionHeatmap(p);
      setData(result);
      if (!p && result.placement) setPlacement(result.placement);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the click heatmap.");
    }
  }, []);

  useEffect(() => {
    load(placement);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSelectPlacement(p: string) {
    setPlacement(p);
    setData(null);
    load(p);
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-white">Click Heatmap</h1>
        <p className="mt-0.5 text-sm text-text-faint">Where clicks land within each ad slot — last 30 days.</p>
      </div>

      {error && <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{error}</div>}

      {data === null ? (
        <div className="flex items-center justify-center py-16 text-text-faint">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : data.placements.length === 0 ? (
        <div className="glass rounded-xl px-4 py-10 text-center text-text-faint">No clicks recorded yet.</div>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap gap-2">
            {data.placements.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handleSelectPlacement(p)}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                  placement === p ? "bg-[var(--color-menu-yellow)] text-black" : "glass-strong text-white/80 hover:text-white"
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="glass max-w-xl rounded-2xl p-6">
            <p className="mb-4 text-sm text-text-faint">
              {data.totalClicks.toLocaleString()} click{data.totalClicks === 1 ? "" : "s"} plotted on <strong className="text-white">{data.placement}</strong>
            </p>
            <HeatmapGrid grid={data.grid} />
          </div>
        </>
      )}
    </div>
  );
}

function HeatmapGrid({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  return (
    <div className="grid aspect-video w-full grid-cols-10 gap-1 rounded-xl bg-white/5 p-2">
      {grid.map((row, rowIdx) =>
        row.map((count, colIdx) => {
          const intensity = count / max;
          return (
            <div
              key={`${rowIdx}-${colIdx}`}
              className="group relative rounded-sm"
              style={{
                backgroundColor: count === 0 ? "rgba(255,255,255,0.03)" : `rgba(255, 179, 0, ${0.15 + intensity * 0.85})`,
              }}
              title={count > 0 ? `${count} click${count === 1 ? "" : "s"}` : undefined}
            />
          );
        })
      )}
    </div>
  );
}
