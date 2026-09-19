"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { fetchAdPlacementCheck, type AdPlacementCheck } from "@/lib/supabase/admin-content";

const STATUS_STYLES = {
  pass: { icon: CheckCircle2, className: "text-emerald-400 bg-emerald-500/15" },
  warn: { icon: AlertTriangle, className: "text-amber-400 bg-amber-500/15" },
  fail: { icon: XCircle, className: "text-hot bg-hot/15" },
} as const;

/** Admin → Monetization → Ad Protection → Ad Placement Validation. A
 * self-review checklist against widely-known ad policy norms (dismissible
 * anchors, reasonable interstitial frequency, no empty/broken slots) plus
 * this app's own detection coverage — not a live third-party ad-network
 * review. See /api/admin/ads/protection/placement-check. */
export function AdProtectionPlacementAdminClient() {
  const [data, setData] = useState<AdPlacementCheck | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await fetchAdPlacementCheck());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run the placement check.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-white">Ad Placement Validation</h1>
        <p className="mt-0.5 text-sm text-text-faint">
          A configuration checklist against common ad policy norms — not a live review from any ad network.
        </p>
      </div>

      {error && <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{error}</div>}

      {data === null ? (
        <div className="flex items-center justify-center py-16 text-text-faint">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : (
        <>
          <div className="mb-5 flex gap-3">
            <SummaryPill count={data.summary.passCount} label="Passed" tone="emerald" />
            <SummaryPill count={data.summary.warnCount} label="Warnings" tone="amber" />
            <SummaryPill count={data.summary.failCount} label="Failed" tone="hot" />
          </div>

          <div className="flex flex-col gap-2">
            {data.checks.map((c) => {
              const style = STATUS_STYLES[c.status];
              const Icon = style.icon;
              return (
                <div key={c.id} className="glass flex items-start gap-3 rounded-xl p-4">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${style.className}`}>
                    <Icon size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{c.label}</p>
                    <p className="mt-0.5 text-xs text-text-faint">{c.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryPill({ count, label, tone }: { count: number; label: string; tone: "emerald" | "amber" | "hot" }) {
  const toneClass = tone === "emerald" ? "text-emerald-400" : tone === "amber" ? "text-amber-400" : "text-hot";
  return (
    <div className="glass flex-1 rounded-xl px-4 py-3 text-center">
      <p className={`font-display text-xl font-bold ${toneClass}`}>{count}</p>
      <p className="text-xs text-text-faint">{label}</p>
    </div>
  );
}
