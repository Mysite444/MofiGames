"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, AlertTriangle, AlertCircle, Info, ExternalLink } from "lucide-react";
import { fetchSeoAnalysis, type SeoAnalysisItem } from "@/lib/supabase/admin-content";

const TYPE_LABELS: Record<SeoAnalysisItem["itemType"], string> = {
  game: "Game",
  category: "Category",
  post: "Blog post",
  page: "Page",
};

function scoreColor(score: number): string {
  if (score >= 85) return "text-emerald-400";
  if (score >= 60) return "text-amber-400";
  return "text-hot";
}

/** Admin → SEO Management → SEO Analysis. Every game/category/post/page's
 * SEO title, meta description, focus keyword, and content length checked
 * on the fly (see /api/admin/seo/analysis) and sorted worst-first, so an
 * admin can immediately see where the highest-impact gaps are instead of
 * clicking into every single item one at a time. */
export function SeoAnalysisAdminClient() {
  const [results, setResults] = useState<SeoAnalysisItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | SeoAnalysisItem["itemType"]>("all");

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setResults(await fetchSeoAnalysis());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load SEO analysis.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = results?.filter((r) => filter === "all" || r.itemType === filter) ?? null;
  const avgScore = results?.length ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length) : null;
  const errorCount = results?.reduce((sum, r) => sum + r.issues.filter((i) => i.severity === "error").length, 0) ?? 0;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">SEO Analysis</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            Every published game, category, post, and page — checked live, worst first.
          </p>
        </div>
        {avgScore !== null && (
          <div className="glass flex items-center gap-4 rounded-xl px-4 py-2.5">
            <div className="text-center">
              <p className={`font-display text-xl font-bold ${scoreColor(avgScore)}`}>{avgScore}</p>
              <p className="text-[10px] uppercase tracking-wide text-text-faint">Avg score</p>
            </div>
            <div className="text-center">
              <p className="font-display text-xl font-bold text-hot">{errorCount}</p>
              <p className="text-[10px] uppercase tracking-wide text-text-faint">Errors</p>
            </div>
          </div>
        )}
      </div>

      {loadError && (
        <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{loadError}</div>
      )}

      <div className="mb-4 flex flex-wrap gap-1.5">
        {(["all", "game", "category", "post", "page"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setFilter(t)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
              filter === t ? "bg-[var(--color-menu-yellow)] text-black" : "bg-white/10 text-white/70 hover:bg-white/20"
            }`}
          >
            {t === "all" ? "All" : TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {filtered === null && (
        <div className="flex items-center justify-center py-20 text-text-faint">
          <Loader2 size={22} className="animate-spin" />
        </div>
      )}

      {filtered?.length === 0 && (
        <p className="glass rounded-2xl p-6 text-sm text-text-faint">Nothing published yet.</p>
      )}

      <div className="flex flex-col gap-2">
        {filtered?.map((r) => (
          <div key={`${r.itemType}-${r.id}`} className="glass rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/70">
                    {TYPE_LABELS[r.itemType]}
                  </span>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 truncate font-semibold text-white hover:underline"
                  >
                    {r.title}
                    <ExternalLink size={11} className="shrink-0 text-white/50" />
                  </a>
                </div>
                {r.issues.length === 0 ? (
                  <p className="mt-1 text-xs text-emerald-400">No issues found.</p>
                ) : (
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {r.issues.map((issue, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-text-muted">
                        {issue.severity === "error" && <AlertCircle size={13} className="mt-0.5 shrink-0 text-hot" />}
                        {issue.severity === "warning" && (
                          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-400" />
                        )}
                        {issue.severity === "info" && <Info size={13} className="mt-0.5 shrink-0 text-white/40" />}
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className={`shrink-0 font-display text-2xl font-bold ${scoreColor(r.score)}`}>{r.score}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
