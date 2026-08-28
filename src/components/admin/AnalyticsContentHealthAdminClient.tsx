"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ImageOff, FileWarning, Tag, Link as LinkIcon, CheckCircle2, PlugZap, AlertTriangle } from "lucide-react";
import Link from "next/link";
import {
  fetchAnalyticsContentHealth,
  runLinkCheck,
  type AnalyticsContentHealth,
  type LinkCheckReport,
} from "@/lib/supabase/admin-content";

type Row = { id: string; slug: string; title: string };

function IssueGroup({
  title,
  icon,
  rows,
}: {
  title: string;
  icon: React.ReactNode;
  rows: Row[];
}) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-white">
          {icon}
          {title}
        </h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
            rows.length === 0 ? "bg-emerald-400/15 text-emerald-400" : "bg-hot/15 text-hot"
          }`}
        >
          {rows.length}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="flex items-center gap-1.5 text-sm text-emerald-400">
          <CheckCircle2 size={14} />
          All good.
        </p>
      ) : (
        <>
          <ul className="mb-2 flex flex-col gap-1.5">
            {rows.map((r) => (
              <li key={r.id} className="truncate text-sm text-white/85">
                {r.title}
              </li>
            ))}
          </ul>
          <Link
            href="/admin/games"
            className="text-xs font-semibold text-[var(--color-menu-yellow)] hover:underline"
          >
            Fix in Games →
          </Link>
        </>
      )}
    </div>
  );
}

/** Admin → Analytics → Content Health. Flags published games missing
 * thumbnail, cover image, description, instructions, tags, SEO
 * description, or (for embed games) an embed URL — the stuff that quietly
 * hurts discoverability and the play experience if nobody's watching for
 * it. See /api/admin/analytics/content-health. */
export function AnalyticsContentHealthAdminClient() {
  const [data, setData] = useState<AnalyticsContentHealth | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [linkReport, setLinkReport] = useState<LinkCheckReport | null>(null);
  const [checkingLinks, setCheckingLinks] = useState(false);
  const [linkCheckError, setLinkCheckError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setData(await fetchAnalyticsContentHealth());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load content health.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCheckLinks() {
    setCheckingLinks(true);
    setLinkCheckError(null);
    try {
      setLinkReport(await runLinkCheck());
    } catch (err) {
      setLinkCheckError(err instanceof Error ? err.message : "Link check failed.");
    } finally {
      setCheckingLinks(false);
    }
  }

  if (loadError) {
    return <div className="rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{loadError}</div>;
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-20 text-text-faint">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Content Health</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            {data.totalPublishedGames} published games checked. Lists are capped at 20 — fix these first.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCheckLinks}
          disabled={checkingLinks}
          className="glow-yellow-button flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-menu-bg)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {checkingLinks ? <Loader2 size={15} className="animate-spin" /> : <PlugZap size={15} />}
          {checkingLinks ? "Checking links…" : "Run link check"}
        </button>
      </div>

      <div className="mb-6">
        <div className="glass rounded-2xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold text-white">
              <PlugZap size={15} />
              Broken game links
            </h2>
            {linkReport && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  linkReport.broken.length === 0 ? "bg-emerald-400/15 text-emerald-400" : "bg-hot/15 text-hot"
                }`}
              >
                {linkReport.broken.length}
              </span>
            )}
          </div>

          {linkCheckError && (
            <div className="mb-3 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">
              {linkCheckError}
            </div>
          )}

          {!linkReport && !checkingLinks && !linkCheckError && (
            <p className="text-sm text-text-faint">
              This actually opens every published game&apos;s embed URL or uploaded file and checks whether
              it still loads — not just whether the field is filled in. Click &quot;Run link check&quot; to
              scan your catalog. It can take a little while on a large catalog.
            </p>
          )}

          {checkingLinks && (
            <div className="flex items-center gap-2 text-sm text-text-faint">
              <Loader2 size={14} className="animate-spin" />
              Pinging every game&apos;s embed URL / uploaded file — this can take a minute…
            </div>
          )}

          {linkReport && !checkingLinks && (
            <div>
              <p className="mb-3 text-xs text-text-faint">
                Checked {linkReport.checked} of {linkReport.totalPublishedGames} published games with a play
                URL.
                {linkReport.truncated && (
                  <> Catalog is larger than one run covers — run again to keep checking the rest.</>
                )}
              </p>
              {linkReport.broken.length === 0 ? (
                <p className="flex items-center gap-1.5 text-sm text-emerald-400">
                  <CheckCircle2 size={14} />
                  Every link checked resolved fine.
                </p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {linkReport.broken.map((b) => (
                    <li key={b.id} className="flex items-start gap-2 text-sm">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-hot" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-white/85">{b.title}</p>
                        <p className="truncate text-xs text-text-faint">
                          {b.source} · {b.reason} ·{" "}
                          <span className="break-all">{b.url}</span>
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <IssueGroup title="Missing thumbnail" icon={<ImageOff size={15} />} rows={data.missingThumbnail} />
        <IssueGroup title="Missing cover image" icon={<ImageOff size={15} />} rows={data.missingCoverImage} />
        <IssueGroup title="Missing description" icon={<FileWarning size={15} />} rows={data.missingDescription} />
        <IssueGroup title="Missing instructions" icon={<FileWarning size={15} />} rows={data.missingInstructions} />
        <IssueGroup title="Missing tags" icon={<Tag size={15} />} rows={data.missingTags} />
        <IssueGroup title="Missing SEO description" icon={<FileWarning size={15} />} rows={data.missingSeoDescription} />
        <IssueGroup title="Missing embed URL / file" icon={<LinkIcon size={15} />} rows={data.brokenEmbedUrls} />
      </div>
    </div>
  );
}
