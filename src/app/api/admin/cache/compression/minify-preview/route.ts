import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import {
  compressionMinifyPreviewInputSchema,
  firstIssueMessage,
} from "@/lib/validation-compression-cache";
import { minifyCss, minifyJs, minifyHtml } from "@/lib/compression-minify";

const COLUMN_BY_TYPE = {
  css: {
    lastRunAt: "css_minify_last_run_at",
    originalBytes: "css_minify_last_original_bytes",
    minifiedBytes: "css_minify_last_minified_bytes",
    removeCommentsCol: "css_minify_remove_comments",
  },
  js: {
    lastRunAt: "js_minify_last_run_at",
    originalBytes: "js_minify_last_original_bytes",
    minifiedBytes: "js_minify_last_minified_bytes",
    removeCommentsCol: "js_minify_remove_comments",
  },
  html: {
    lastRunAt: "html_minify_last_run_at",
    originalBytes: "html_minify_last_original_bytes",
    minifiedBytes: "html_minify_last_minified_bytes",
    removeCommentsCol: "html_minify_remove_comments",
  },
} as const;

/** POST /api/admin/cache/compression/minify-preview — Admin → Cache →
 * Compression → "Minify Preview". Admin-only. Runs the pasted-in
 * CSS/JS/HTML through the real minifier for that type (src/lib/
 * compression-minify.ts — comment/whitespace-safe, not a full
 * parser-based minifier) and records the before/after byte counts as
 * that feature's "last run" stats, the same way a real build step would
 * update them. This is a preview tool, not a build pipeline — nothing
 * this app serves is rewritten by it. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = compressionMinifyPreviewInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 422 });
  }
  const { type, code } = parsed.data;

  // Read the current "remove comments" preference for this type so the
  // preview matches what a real run would actually do.
  const cols = COLUMN_BY_TYPE[type];
  const { data: settingsRow, error: readError } = await supabase
    .from("compression_cache_settings")
    .select(cols.removeCommentsCol)
    .eq("id", true)
    .maybeSingle();
  if (readError) {
    return NextResponse.json({ error: "Failed to load Compression settings." }, { status: 500 });
  }
  const removeComments = Boolean(
    (settingsRow as Record<string, unknown> | null)?.[cols.removeCommentsCol] ?? true,
  );

  const result =
    type === "css"
      ? minifyCss(code, { removeComments })
      : type === "js"
        ? minifyJs(code, { removeComments })
        : minifyHtml(code, { removeComments });

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("compression_cache_settings")
    .update({
      [cols.lastRunAt]: now,
      [cols.originalBytes]: result.originalBytes,
      [cols.minifiedBytes]: result.minifiedBytes,
      updated_by: user.id,
    })
    .eq("id", true)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      {
        result: { output: result.output, originalBytes: result.originalBytes, minifiedBytes: result.minifiedBytes },
        settings: null,
        warning: "Minified, but failed to record the stats.",
      },
      { status: 207 },
    );
  }

  return NextResponse.json({
    result: { output: result.output, originalBytes: result.originalBytes, minifiedBytes: result.minifiedBytes },
    settings: data,
  });
}
