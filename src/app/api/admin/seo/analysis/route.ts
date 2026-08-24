import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import type { SeoAnalysisIssue, SeoAnalysisResult } from "@/lib/types";

// GET /api/admin/seo/analysis — SEO Analysis dashboard. Computed fresh on
// every request rather than persisted: the underlying content changes
// far more often than anyone will load this page, so caching a stale
// score would be actively misleading (a "hint at what's on this page and
// let the admin decide" tool loses its whole point if it lies).

function analyze(params: {
  itemType: SeoAnalysisResult["itemType"];
  id: string;
  title: string;
  url: string;
  seoTitle: string;
  description: string;
  content?: string;
  hasFocusKeyword?: boolean;
  hasCanonicalConflict?: boolean;
}): SeoAnalysisResult {
  const issues: SeoAnalysisIssue[] = [];
  const titleLength = (params.seoTitle || params.title).length;
  const descriptionLength = params.description.length;
  const wordCount = params.content ? params.content.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length : 0;

  if (titleLength === 0) {
    issues.push({ severity: "error", message: "Missing title." });
  } else if (titleLength > 70) {
    issues.push({ severity: "warning", message: `Title is ${titleLength} characters — Google typically truncates past ~60-70.` });
  } else if (titleLength < 30) {
    issues.push({ severity: "info", message: "Title is quite short — consider making it more descriptive." });
  }

  if (descriptionLength === 0) {
    issues.push({ severity: "error", message: "Missing meta description." });
  } else if (descriptionLength > 300) {
    issues.push({ severity: "warning", message: `Description is ${descriptionLength} characters — trim to under ~160 for search snippets.` });
  } else if (descriptionLength < 70) {
    issues.push({ severity: "info", message: "Description is short — there's room to add more compelling detail." });
  }

  if (params.hasFocusKeyword === false) {
    issues.push({ severity: "info", message: "No focus keyword set." });
  }

  if (params.content !== undefined && wordCount > 0 && wordCount < 100) {
    issues.push({ severity: "warning", message: `Only ${wordCount} words of content — thin content can hurt rankings.` });
  }

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const score = Math.max(0, 100 - errorCount * 30 - warningCount * 12);

  return {
    itemType: params.itemType,
    id: params.id,
    title: params.title,
    url: params.url,
    score,
    issues,
    wordCount,
    titleLength,
    descriptionLength,
  };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const [gamesRes, categoriesRes, postsRes, pagesRes] = await Promise.all([
    supabase
      .from("games")
      .select("id, slug, title, meta_title, meta_description, seo_focus_keyword, description, is_published")
      .eq("is_published", true),
    supabase.from("categories").select("slug, name, seo_title, seo_description, seo_focus_keyword, description"),
    supabase
      .from("posts")
      .select("id, slug, title, seo_title, seo_description, seo_focus_keyword, content, is_published")
      .eq("is_published", true),
    supabase
      .from("pages")
      .select("id, slug, title, seo_title, meta_description, content, is_published")
      .eq("is_published", true),
  ]);

  const results: SeoAnalysisResult[] = [
    ...(gamesRes.data ?? []).map((g) =>
      analyze({
        itemType: "game",
        id: g.id,
        title: g.title,
        url: `/${g.slug}`,
        seoTitle: g.meta_title ?? "",
        description: g.meta_description ?? "",
        content: g.description ?? "",
        hasFocusKeyword: Boolean(g.seo_focus_keyword),
      })
    ),
    ...(categoriesRes.data ?? []).map((c) =>
      analyze({
        itemType: "category",
        id: c.slug,
        title: c.name,
        url: `/${c.slug}`,
        seoTitle: c.seo_title ?? "",
        description: c.seo_description ?? c.description ?? "",
        hasFocusKeyword: Boolean(c.seo_focus_keyword),
      })
    ),
    ...(postsRes.data ?? []).map((p) =>
      analyze({
        itemType: "post",
        id: p.id,
        title: p.title,
        url: `/blog/${p.slug}`,
        seoTitle: p.seo_title ?? "",
        description: p.seo_description ?? "",
        content: p.content ?? "",
        hasFocusKeyword: Boolean(p.seo_focus_keyword),
      })
    ),
    ...(pagesRes.data ?? []).map((p) =>
      analyze({
        itemType: "page",
        id: p.id,
        title: p.title,
        url: `/${p.slug}`,
        seoTitle: p.seo_title ?? "",
        description: p.meta_description ?? "",
        content: p.content ?? "",
      })
    ),
  ].sort((a, b) => a.score - b.score);

  return NextResponse.json({ results });
}
