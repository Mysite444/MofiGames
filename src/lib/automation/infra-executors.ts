import { revalidatePath } from "next/cache";
import type { JobExecutor } from "./types";
import { runCachePreload } from "@/lib/cache-preload";

const SITEMAP_PATHS = [
  "/sitemap.xml",
  "/sitemaps/games.xml",
  "/sitemaps/categories.xml",
  "/sitemaps/tags.xml",
  "/sitemaps/pages.xml",
  "/sitemaps/blog.xml",
  "/sitemaps/images.xml",
];

export const autoSitemapUpdate: JobExecutor = async () => {
  const revalidated: string[] = [];
  for (const path of SITEMAP_PATHS) {
    try {
      revalidatePath(path);
      revalidated.push(path);
    } catch {
      // A route that doesn't exist in this build (or isn't cached) is not
      // an error — just nothing to revalidate there.
    }
  }
  return {
    status: "success",
    itemsProcessed: revalidated.length,
    itemsOk: revalidated.length,
    itemsFailed: 0,
    summary: { revalidated },
  };
};

export const autoCachePurge: JobExecutor = async () => {
  revalidatePath("/", "layout");
  return {
    status: "success",
    itemsProcessed: 1,
    itemsOk: 1,
    itemsFailed: 0,
    summary: { purged: "entire site (layout revalidation)" },
  };
};

export const autoCdnCachePurge: JobExecutor = async (_supabase, config) => {
  const webhookUrl = typeof config.webhookUrl === "string" ? config.webhookUrl : "";
  if (!webhookUrl) {
    return {
      status: "success",
      itemsProcessed: 0,
      itemsOk: 0,
      itemsFailed: 0,
      summary: { note: "No CDN purge webhook configured — set one in this job's settings to enable this step." },
    };
  }
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "purge_all", triggeredBy: "mofigames-automation" }),
    });
    return {
      status: res.ok ? "success" : "failed",
      itemsProcessed: 1,
      itemsOk: res.ok ? 1 : 0,
      itemsFailed: res.ok ? 0 : 1,
      summary: { webhookUrl, httpStatus: res.status },
      error: res.ok ? undefined : `Webhook responded with HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      status: "failed",
      itemsProcessed: 1,
      itemsOk: 0,
      itemsFailed: 1,
      summary: { webhookUrl },
      error: err instanceof Error ? err.message : "Webhook request failed",
    };
  }
};

/** Admin → Cache → Preloading & Prefetching → Cache Preloading, run on
 * the schedule configured here in Automation → Infra instead of (or in
 * addition to) the manual "Preload Now" button on that page. Shares its
 * worker with the manual trigger — see runCachePreload() in
 * src/lib/cache-preload.ts — so both write to the same run history. */
export const cachePreload: JobExecutor = async (supabase) => {
  const summary = await runCachePreload(supabase);
  if (!summary) {
    return {
      status: "success",
      itemsProcessed: 0,
      itemsOk: 0,
      itemsFailed: 0,
      summary: { note: "Cache Preloading is disabled — enable it under Admin → Cache → Preloading & Prefetching to include it in scheduled runs." },
    };
  }
  return {
    status: summary.failed === 0 ? "success" : summary.ok === 0 ? "failed" : "partial",
    itemsProcessed: summary.total,
    itemsOk: summary.ok,
    itemsFailed: summary.failed,
    summary: { results: summary.results, durationMs: summary.durationMs },
  };
};
