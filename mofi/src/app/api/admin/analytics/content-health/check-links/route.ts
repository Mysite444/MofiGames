import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { resolveGameFileUrl } from "@/lib/blob/game-file-url";

// Real network checks (not just "is the field filled in") can take a
// while across a whole catalog — give this route more room than the
// platform default. Supported on Vercel Pro+ (Hobby is capped at 60s
// regardless of this value); see Next.js route segment config docs.
export const maxDuration = 60;

const CHECK_TIMEOUT_MS = 6000;
const CONCURRENCY = 10;
// Safety cap so one run can't spiral into checking thousands of URLs and
// blowing the function's time budget. Re-run to cover the rest if you're
// above this — each run checks the next batch.
const MAX_GAMES_PER_RUN = 150;

interface CheckTarget {
  id: string;
  slug: string;
  title: string;
  url: string;
  source: "embed_url" | "uploaded file";
}

interface CheckResult extends CheckTarget {
  ok: boolean;
  reason: string;
}

async function checkUrl(target: CheckTarget): Promise<CheckResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

  const attempt = async (method: "HEAD" | "GET") => {
    const res = await fetch(target.url, {
      method,
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "MofiGames-LinkChecker/1.0" },
    });
    return res;
  };

  try {
    let res: Response;
    try {
      res = await attempt("HEAD");
      // Some servers don't support HEAD properly (405/501, or lie and
      // return 200 for anything) — fall back to GET to be sure.
      if (res.status === 405 || res.status === 501) {
        res = await attempt("GET");
      }
    } catch {
      // HEAD outright failed (some CDNs reject it) — try GET before
      // giving up.
      res = await attempt("GET");
    }

    clearTimeout(timeout);
    if (res.ok) {
      return { ...target, ok: true, reason: `${res.status} OK` };
    }
    return { ...target, ok: false, reason: `HTTP ${res.status}` };
  } catch (err) {
    clearTimeout(timeout);
    const message = err instanceof Error && err.name === "AbortError" ? "Timed out" : "Unreachable";
    return { ...target, ok: false, reason: message };
  }
}

async function runWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function runner() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return results;
}

/** POST /api/admin/analytics/content-health/check-links — actually pings
 * every published game's play URL (embed_url for embed games, the public
 * storage URL for uploaded builds) and reports which ones don't resolve.
 * This is the "really broken" check — distinct from the passive
 * "missing embed URL" flag on the main content-health endpoint, which
 * only catches an empty field, not a dead link. Triggered on demand from
 * Admin → Analytics → Content Health ("Run link check") rather than on
 * every page load, since it makes real outbound requests. */
export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data: games, error } = await supabase
    .from("games")
    .select("id, slug, title, play_type, embed_url, storage_path")
    .eq("is_published", true)
    .limit(MAX_GAMES_PER_RUN);

  if (error) {
    return NextResponse.json({ error: "Could not load games." }, { status: 500 });
  }

  const targets: CheckTarget[] = [];
  for (const g of games ?? []) {
    if (g.play_type === "embed" && g.embed_url) {
      targets.push({ id: g.id, slug: g.slug, title: g.title, url: g.embed_url, source: "embed_url" });
    } else if (g.play_type === "upload" && g.storage_path) {
      targets.push({
        id: g.id,
        slug: g.slug,
        title: g.title,
        url: resolveGameFileUrl(g.storage_path),
        source: "uploaded file",
      });
    }
    // Games with no URL/path at all are already flagged by the passive
    // content-health check — nothing new to report here.
  }

  const results = await runWithConcurrency(targets, CONCURRENCY, checkUrl);
  const broken = results.filter((r) => !r.ok);

  return NextResponse.json({
    checked: results.length,
    totalPublishedGames: (games ?? []).length,
    truncated: (games ?? []).length >= MAX_GAMES_PER_RUN,
    broken: broken.map(({ id, slug, title, url, source, reason }) => ({ id, slug, title, url, source, reason })),
  });
}
