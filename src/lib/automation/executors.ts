import type { SupabaseClient } from "@supabase/supabase-js";
import { slugify } from "@/lib/prng";
import { resolveGameFileUrl } from "@/lib/blob/game-file-url";
import { checkLink, runWithConcurrency, extractHrefLinks } from "./link-check";
import type { JobExecutor, JobRunOutcome } from "./types";

const CONCURRENCY = 10;
const MAX_GAMES_PER_RUN = 150;

function outcome(itemsProcessed: number, itemsFailed: number, summary: Record<string, unknown>): JobRunOutcome {
  const itemsOk = itemsProcessed - itemsFailed;
  return {
    status: itemsProcessed === 0 ? "success" : itemsFailed === 0 ? "success" : itemsFailed === itemsProcessed ? "failed" : "partial",
    itemsProcessed,
    itemsOk,
    itemsFailed,
    summary,
  };
}

// ---------------------------------------------------------------------------
// Scheduled Publishing — covers both games and posts
// ---------------------------------------------------------------------------
export const scheduledPublishing: JobExecutor = async (supabase) => {
  const nowIso = new Date().toISOString();

  // --- Games ---
  const { data: dueGames, error: gamesError } = await supabase
    .from("games")
    .select("id, slug, title")
    .eq("is_published", false)
    .is("deleted_at", null)
    .not("scheduled_publish_at", "is", null)
    .lte("scheduled_publish_at", nowIso)
    .limit(200);
  if (gamesError) throw new Error(gamesError.message);

  let gamesPublished = 0;
  if (dueGames && dueGames.length > 0) {
    const { error: updateError } = await supabase
      .from("games")
      .update({ is_published: true, scheduled_publish_at: null })
      .in("id", dueGames.map((g) => g.id));
    if (updateError) throw new Error(updateError.message);
    gamesPublished = dueGames.length;
  }

  // --- Posts (migration 0070 adds scheduled_publish_at to posts) ---
  const { data: duePosts, error: postsError } = await supabase
    .from("posts")
    .select("id, slug, title")
    .eq("is_published", false)
    .is("deleted_at", null)
    .not("scheduled_publish_at", "is", null)
    .lte("scheduled_publish_at", nowIso)
    .limit(200);
  if (postsError) throw new Error(postsError.message);

  let postsPublished = 0;
  if (duePosts && duePosts.length > 0) {
    const { error: updateError } = await supabase
      .from("posts")
      .update({ is_published: true, scheduled_publish_at: null })
      .in("id", duePosts.map((p) => p.id));
    if (updateError) throw new Error(updateError.message);
    postsPublished = duePosts.length;
  }

  const total = gamesPublished + postsPublished;
  return outcome(total, 0, {
    gamesPublished,
    postsPublished,
    games: (dueGames ?? []).map((g) => ({ id: g.id, slug: g.slug, title: g.title })),
    posts: (duePosts ?? []).map((p) => ({ id: p.id, slug: p.slug, title: p.title })),
  });
};

// ---------------------------------------------------------------------------
// Broken Embed Checker / Auto Game Status Check
// ---------------------------------------------------------------------------
interface EmbedTarget {
  id: string;
  slug: string;
  title: string;
  url: string;
}

async function loadEmbedTargets(supabase: SupabaseClient): Promise<EmbedTarget[]> {
  const { data: games, error } = await supabase
    .from("games")
    .select("id, slug, title, play_type, embed_url, storage_path")
    .eq("is_published", true)
    .limit(MAX_GAMES_PER_RUN);
  if (error) throw new Error(error.message);

  const targets: EmbedTarget[] = [];
  for (const g of games ?? []) {
    if (g.play_type === "embed" && g.embed_url) {
      targets.push({ id: g.id, slug: g.slug, title: g.title, url: g.embed_url });
    } else if (g.play_type === "upload" && g.storage_path) {
      targets.push({ id: g.id, slug: g.slug, title: g.title, url: resolveGameFileUrl(g.storage_path) });
    }
  }
  return targets;
}

export const brokenEmbedChecker: JobExecutor = async (supabase) => {
  const targets = await loadEmbedTargets(supabase);
  const results = await runWithConcurrency(targets, CONCURRENCY, async (t) => ({
    ...t,
    ...(await checkLink(t.url)),
  }));

  const nowIso = new Date().toISOString();
  await Promise.all(
    results.map((r) =>
      supabase
        .from("games")
        .update({
          embed_status: r.ok ? "online" : "offline",
          embed_checked_at: nowIso,
          embed_fail_count: r.ok ? 0 : undefined,
        })
        .eq("id", r.id)
    )
  );
  // Increment fail_count for failures separately (needs the current value).
  const failedIds = results.filter((r) => !r.ok).map((r) => r.id);
  if (failedIds.length > 0) {
    const { data: current } = await supabase.from("games").select("id, embed_fail_count").in("id", failedIds);
    await Promise.all(
      (current ?? []).map((g) =>
        supabase
          .from("games")
          .update({ embed_fail_count: (g.embed_fail_count ?? 0) + 1 })
          .eq("id", g.id)
      )
    );
  }

  const broken = results.filter((r) => !r.ok);
  return outcome(results.length, broken.length, {
    checked: results.length,
    broken: broken.map(({ id, slug, title, url, reason }) => ({ id, slug, title, url, reason })),
  });
};

export const autoGameStatusCheck: JobExecutor = async (supabase, config) => {
  const threshold = Number(config.autoUnpublishAfterFailures ?? 5);
  const base = await brokenEmbedChecker(supabase, config);

  const { data: overThreshold } = await supabase
    .from("games")
    .select("id, slug, title, embed_fail_count")
    .eq("is_published", true)
    .gte("embed_fail_count", threshold);

  let unpublished: { id: string; slug: string; title: string }[] = [];
  if (overThreshold && overThreshold.length > 0) {
    const ids = overThreshold.map((g) => g.id);
    await supabase.from("games").update({ is_published: false }).in("id", ids);
    unpublished = overThreshold.map((g) => ({ id: g.id, slug: g.slug, title: g.title }));
  }

  return {
    ...base,
    summary: { ...base.summary, autoUnpublished: unpublished, threshold },
  };
};

// ---------------------------------------------------------------------------
// Dead Link Scanner (media URLs, distinct from the play-URL embed check)
// ---------------------------------------------------------------------------
export const deadLinkScanner: JobExecutor = async (supabase) => {
  const { data: games, error } = await supabase
    .from("games")
    .select("id, slug, title, thumbnail_url, cover_image_url, video_trailer_url, preview_video_url")
    .eq("is_published", true)
    .limit(MAX_GAMES_PER_RUN);
  if (error) throw new Error(error.message);

  interface MediaTarget {
    gameId: string;
    slug: string;
    title: string;
    field: string;
    url: string;
  }
  const targets: MediaTarget[] = [];
  for (const g of games ?? []) {
    for (const field of ["thumbnail_url", "cover_image_url", "video_trailer_url", "preview_video_url"] as const) {
      const url = g[field];
      if (url) targets.push({ gameId: g.id, slug: g.slug, title: g.title, field, url });
    }
  }

  const results = await runWithConcurrency(targets, CONCURRENCY, async (t) => ({ ...t, ...(await checkLink(t.url)) }));
  const brokenByGame = new Map<string, boolean>();
  for (const r of results) {
    if (!r.ok) brokenByGame.set(r.gameId, true);
  }

  const nowIso = new Date().toISOString();
  const gameIds = Array.from(new Set(results.map((r) => r.gameId)));
  await Promise.all(
    gameIds.map((id) =>
      supabase
        .from("games")
        .update({ link_status: brokenByGame.has(id) ? "broken" : "ok", link_checked_at: nowIso })
        .eq("id", id)
    )
  );

  const broken = results.filter((r) => !r.ok);
  return outcome(results.length, broken.length, {
    checked: results.length,
    broken: broken.map(({ gameId, slug, title, field, url, reason }) => ({ gameId, slug, title, field, url, reason })),
  });
};

// ---------------------------------------------------------------------------
// Auto Link Validation — outbound links inside Pages / Blog posts
// ---------------------------------------------------------------------------
export const autoLinkValidation: JobExecutor = async (supabase) => {
  const [{ data: pages }, { data: posts }] = await Promise.all([
    supabase.from("pages").select("id, slug, title, content").eq("is_published", true).limit(100),
    supabase.from("posts").select("id, slug, title, content").eq("is_published", true).limit(100),
  ]);

  interface Source {
    kind: "page" | "post";
    id: string;
    slug: string;
    title: string;
    url: string;
  }
  const targets: Source[] = [];
  for (const p of pages ?? []) {
    for (const url of extractHrefLinks(p.content ?? "")) targets.push({ kind: "page", id: p.id, slug: p.slug, title: p.title, url });
  }
  for (const p of posts ?? []) {
    for (const url of extractHrefLinks(p.content ?? "")) targets.push({ kind: "post", id: p.id, slug: p.slug, title: p.title, url });
  }

  const results = await runWithConcurrency(targets, CONCURRENCY, async (t) => ({ ...t, ...(await checkLink(t.url)) }));
  const broken = results.filter((r) => !r.ok);
  return outcome(results.length, broken.length, {
    checked: results.length,
    broken: broken.map(({ kind, slug, title, url, reason }) => ({ kind, slug, title, url, reason })),
  });
};

// ---------------------------------------------------------------------------
// Duplicate Game Detection
// ---------------------------------------------------------------------------
export const duplicateGameDetection: JobExecutor = async (supabase) => {
  const { data: games, error } = await supabase
    .from("games")
    .select("id, slug, title, category_slug, embed_url")
    .limit(3000);
  if (error) throw new Error(error.message);

  const byTitleCategory = new Map<string, { id: string; slug: string; title: string }[]>();
  const byEmbedUrl = new Map<string, { id: string; slug: string; title: string }[]>();

  for (const g of games ?? []) {
    const titleKey = `${g.title.trim().toLowerCase()}::${g.category_slug}`;
    byTitleCategory.set(titleKey, [...(byTitleCategory.get(titleKey) ?? []), g]);
    if (g.embed_url) {
      byEmbedUrl.set(g.embed_url, [...(byEmbedUrl.get(g.embed_url) ?? []), g]);
    }
  }

  const titleDuplicates = Array.from(byTitleCategory.values()).filter((group) => group.length > 1);
  const embedDuplicates = Array.from(byEmbedUrl.entries())
    .filter(([, group]) => group.length > 1)
    .map(([url, group]) => ({ url, games: group }));

  const flaggedCount = titleDuplicates.reduce((sum, g) => sum + g.length, 0);
  return outcome((games ?? []).length, 0, {
    scanned: (games ?? []).length,
    titleDuplicateGroups: titleDuplicates,
    embedUrlDuplicateGroups: embedDuplicates,
    flaggedGames: flaggedCount,
  });
};

// ---------------------------------------------------------------------------
// Auto Metadata Generation — fills empty descriptions
// ---------------------------------------------------------------------------
export const autoMetadataGeneration: JobExecutor = async (supabase) => {
  const { data: games, error } = await supabase
    .from("games")
    .select("id, slug, title, category_slug, description")
    .eq("description", "")
    .limit(100);
  if (error) throw new Error(error.message);
  if (!games || games.length === 0) return outcome(0, 0, { updated: [] });

  const { data: categories } = await supabase.from("categories").select("slug, name");
  const catName = new Map((categories ?? []).map((c) => [c.slug, c.name]));

  const updates = games.map((g) => ({
    id: g.id,
    slug: g.slug,
    description: `Play ${g.title} free online. A ${catName.get(g.category_slug) ?? "fun"} game — no download required, jump straight in and play in your browser.`,
  }));

  let failed = 0;
  for (const u of updates) {
    const { error: uErr } = await supabase.from("games").update({ description: u.description }).eq("id", u.id);
    if (uErr) failed++;
  }

  return outcome(updates.length, failed, { updated: updates.map(({ id, slug }) => ({ id, slug })) });
};

// ---------------------------------------------------------------------------
// Auto Slug Generation — repairs malformed slugs (mostly from imports)
// ---------------------------------------------------------------------------
const VALID_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const autoSlugGeneration: JobExecutor = async (supabase) => {
  const { data: games, error } = await supabase.from("games").select("id, slug, title").limit(3000);
  if (error) throw new Error(error.message);

  const existingSlugs = new Set((games ?? []).map((g) => g.slug));
  const malformed = (games ?? []).filter((g) => !VALID_SLUG.test(g.slug));

  const fixed: { id: string; oldSlug: string; newSlug: string }[] = [];
  let failed = 0;
  for (const g of malformed) {
    const base = slugify(g.title || g.slug) || "game";
    let candidate = base;
    let n = 2;
    while (existingSlugs.has(candidate)) {
      candidate = `${base}-${n}`;
      n++;
    }
    const { error: uErr } = await supabase.from("games").update({ slug: candidate }).eq("id", g.id);
    if (uErr) {
      failed++;
      continue;
    }
    existingSlugs.delete(g.slug);
    existingSlugs.add(candidate);
    fixed.push({ id: g.id, oldSlug: g.slug, newSlug: candidate });
  }

  return outcome(malformed.length, failed, { fixed });
};

// ---------------------------------------------------------------------------
// Auto SEO Metadata — meta_title / meta_description via AI, or heuristic
// fallback when ANTHROPIC_API_KEY isn't set.
// ---------------------------------------------------------------------------
async function aiSeoFor(title: string, description: string): Promise<{ metaTitle: string; metaDescription: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const prompt = `Write SEO metadata for a free online games website (MofiGames) game page.
Title: ${title}
Description: ${description || "(none provided)"}
Respond with ONLY a JSON object: {"meta_title": "50-60 char SEO title", "meta_description": "140-160 char meta description"}. No markdown, no commentary.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 300, messages: [{ role: "user", content: prompt }] }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const text = (data.content ?? [])
      .map((b: { type: string; text?: string }) => (b.type === "text" ? b.text ?? "" : ""))
      .join("");
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    if (typeof parsed.meta_title === "string" && typeof parsed.meta_description === "string") {
      return { metaTitle: parsed.meta_title, metaDescription: parsed.meta_description };
    }
    return null;
  } catch {
    return null;
  }
}

function heuristicSeo(title: string, description: string): { metaTitle: string; metaDescription: string } {
  const metaTitle = `Play ${title} Online Free — MofiGames`.slice(0, 60);
  const base = description || `Play ${title} free online, no download needed.`;
  const metaDescription = base.length > 160 ? `${base.slice(0, 157)}...` : base;
  return { metaTitle, metaDescription };
}

export const autoSeoMetadata: JobExecutor = async (supabase) => {
  const { data: games, error } = await supabase
    .from("games")
    .select("id, slug, title, description, meta_title, meta_description")
    .or("meta_title.eq.,meta_description.eq.")
    .limit(50);
  if (error) throw new Error(error.message);
  if (!games || games.length === 0) return outcome(0, 0, { updated: [] });

  const updated: { id: string; slug: string; usedAi: boolean }[] = [];
  let failed = 0;
  for (const g of games) {
    const ai = await aiSeoFor(g.title, g.description);
    const { metaTitle, metaDescription } = ai ?? heuristicSeo(g.title, g.description);
    const { error: uErr } = await supabase
      .from("games")
      .update({
        meta_title: g.meta_title || metaTitle,
        meta_description: g.meta_description || metaDescription,
      })
      .eq("id", g.id);
    if (uErr) failed++;
    else updated.push({ id: g.id, slug: g.slug, usedAi: Boolean(ai) });
  }

  return outcome(games.length, failed, { updated });
};

// ---------------------------------------------------------------------------
// Auto Thumbnail Generation — placeholder SVG for published games with none
// ---------------------------------------------------------------------------
function placeholderThumbnail(title: string, colorFrom: string, colorTo: string): string {
  const initial = (title.trim()[0] ?? "?").toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${colorFrom}"/><stop offset="100%" stop-color="${colorTo}"/></linearGradient></defs>
<rect width="400" height="300" fill="url(#g)"/>
<text x="200" y="175" font-family="sans-serif" font-size="120" font-weight="700" fill="rgba(255,255,255,0.9)" text-anchor="middle">${initial}</text>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export const autoThumbnailGeneration: JobExecutor = async (supabase) => {
  const { data: games, error } = await supabase
    .from("games")
    .select("id, slug, title, category_slug")
    .eq("is_published", true)
    .or("thumbnail_url.is.null,thumbnail_url.eq.")
    .limit(100);
  if (error) throw new Error(error.message);
  if (!games || games.length === 0) return outcome(0, 0, { generated: [] });

  const categorySlugs = Array.from(new Set(games.map((g) => g.category_slug)));
  const { data: categories } = await supabase
    .from("categories")
    .select("slug, color_from, color_to")
    .in("slug", categorySlugs);
  const colors = new Map((categories ?? []).map((c) => [c.slug, c]));

  const generated: { id: string; slug: string }[] = [];
  let failed = 0;
  for (const g of games) {
    const c = colors.get(g.category_slug);
    const thumb = placeholderThumbnail(g.title, c?.color_from ?? "#8b5cf6", c?.color_to ?? "#ec4899");
    const { error: uErr } = await supabase.from("games").update({ thumbnail_url: thumb }).eq("id", g.id);
    if (uErr) failed++;
    else generated.push({ id: g.id, slug: g.slug });
  }

  return outcome(games.length, failed, { generated });
};

// ---------------------------------------------------------------------------
// Auto Image Optimization / Auto WebP Conversion — flags for review
// (no server-side image codec available without a native dependency, so
// this job identifies what needs attention rather than silently rewriting
// binary image data).
// ---------------------------------------------------------------------------
export const autoImageOptimization: JobExecutor = async (supabase, config) => {
  const maxKb = Number(config.maxKb ?? 500);
  const { data: games, error } = await supabase
    .from("games")
    .select("id, slug, title, thumbnail_url, cover_image_url")
    .eq("is_published", true)
    .limit(MAX_GAMES_PER_RUN);
  if (error) throw new Error(error.message);

  interface Target {
    gameId: string;
    slug: string;
    field: string;
    url: string;
  }
  const targets: Target[] = [];
  for (const g of games ?? []) {
    for (const field of ["thumbnail_url", "cover_image_url"] as const) {
      const url = g[field];
      if (url && url.startsWith("http")) targets.push({ gameId: g.id, slug: g.slug, field, url });
    }
  }

  const results = await runWithConcurrency(targets, CONCURRENCY, async (t) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(t.url, { method: "HEAD", signal: controller.signal });
      clearTimeout(timeout);
      const lenHeader = res.headers.get("content-length");
      const kb = lenHeader ? Math.round(parseInt(lenHeader, 10) / 1024) : null;
      return { ...t, kb, oversized: kb !== null && kb > maxKb };
    } catch {
      return { ...t, kb: null, oversized: false };
    }
  });

  const oversized = results.filter((r) => r.oversized);
  return outcome(results.length, 0, { checked: results.length, maxKb, oversized });
};

export const autoWebpConversion: JobExecutor = async (supabase) => {
  const { data: games, error } = await supabase
    .from("games")
    .select("id, slug, title, thumbnail_url, cover_image_url")
    .eq("is_published", true)
    .limit(MAX_GAMES_PER_RUN);
  if (error) throw new Error(error.message);

  const nonWebp: { gameId: string; slug: string; field: string; url: string }[] = [];
  for (const g of games ?? []) {
    for (const field of ["thumbnail_url", "cover_image_url"] as const) {
      const url = g[field];
      if (url && url.startsWith("http") && !/\.webp(\?|$)/i.test(url)) {
        nonWebp.push({ gameId: g.id, slug: g.slug, field, url });
      }
    }
  }

  return outcome((games ?? []).length, 0, { scanned: (games ?? []).length, flaggedForConversion: nonWebp });
};

// ---------------------------------------------------------------------------
// Scheduled Database Cleanup
// ---------------------------------------------------------------------------
export const scheduledDbCleanup: JobExecutor = async (supabase, config) => {
  const retentionDays = Number(config.retentionDays ?? 180);
  const jobLogRetentionDays = Number(config.jobLogRetentionDays ?? 90);
  const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
  const jobLogCutoff = new Date(Date.now() - jobLogRetentionDays * 86400000).toISOString();

  const results: Record<string, number> = {};
  let failed = 0;

  for (const table of ["page_views", "search_queries", "game_plays"] as const) {
    const { error, count } = await supabase.from(table).delete({ count: "exact" }).lt("created_at", cutoff);
    if (error) failed++;
    else results[table] = count ?? 0;
  }

  const { error: runsErr, count: runsCount } = await supabase
    .from("automation_job_runs")
    .delete({ count: "exact" })
    .lt("started_at", jobLogCutoff);
  if (runsErr) failed++;
  else results.automation_job_runs = runsCount ?? 0;

  const totalDeleted = Object.values(results).reduce((a, b) => a + b, 0);
  return outcome(5, failed, { deleted: results, totalDeleted, retentionDays, jobLogRetentionDays });
};

// ---------------------------------------------------------------------------
// Scheduled Backups — JSON export of core content tables to storage.
// Encrypted (AES-256-GCM) when BACKUP_ENCRYPTION_KEY is set — see
// src/lib/backup-crypto.ts — otherwise stored as plain JSON (still
// admin-only via the bucket's RLS policies, but not encrypted at the
// application layer).
// ---------------------------------------------------------------------------
export const scheduledBackups: JobExecutor = async (supabase, config) => {
  const keepLast = Number(config.keepLast ?? 14);
  const tables = ["games", "categories", "tags", "pages", "posts"] as const;

  try {
    const dump: Record<string, unknown> = {};
    for (const table of tables) {
      const { data, error } = await supabase.from(table).select("*").limit(5000);
      if (error) throw new Error(`Failed to read ${table}: ${error.message}`);
      dump[table] = data;
    }

    const { backupEncryptionEnabled, encryptBackup } = await import("@/lib/backup-crypto");
    const encrypted = backupEncryptionEnabled();
    const body = JSON.stringify({ createdAt: new Date().toISOString(), tables: dump }, null, 2);
    const uploadBody: Blob = encrypted
      ? new Blob([new Uint8Array(encryptBackup(body))], { type: "application/octet-stream" })
      : new Blob([body], { type: "application/json" });
    const filename = `backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json${encrypted ? ".enc" : ""}`;

    const { error: uploadError } = await supabase.storage
      .from("automation-backups")
      .upload(filename, uploadBody, { upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    // Prune old backups beyond keepLast.
    const { data: existing } = await supabase.storage.from("automation-backups").list("", { limit: 1000 });
    let pruned: string[] = [];
    if (existing && existing.length > keepLast) {
      const sorted = [...existing].sort((a, b) => (a.name < b.name ? 1 : -1)); // newest first (ISO names sort lexically)
      const toRemove = sorted.slice(keepLast).map((f) => f.name);
      if (toRemove.length > 0) {
        await supabase.storage.from("automation-backups").remove(toRemove);
        pruned = toRemove;
      }
    }

    return outcome(1, 0, {
      filename,
      sizeBytes: body.length,
      encrypted,
      tablesBackedUp: tables,
      rowCounts: Object.fromEntries(tables.map((t) => [t, (dump[t] as unknown[])?.length ?? 0])),
      pruned,
    });
  } catch (err) {
    // Best-effort — a failure logging its own failure should never mask
    // the original error from run-job.ts's normal failure handling.
    await supabase
      .from("security_alerts")
      .insert({
        type: "backup_failed",
        severity: "critical",
        message: `Scheduled backup failed: ${err instanceof Error ? err.message : "unknown error"}`,
      })
      .then(undefined, () => {});
    throw err;
  }
};
