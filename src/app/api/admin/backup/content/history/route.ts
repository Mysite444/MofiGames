import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";

/** GET /api/admin/backup/content/history — powers the "Last backup
 * date / size / version" and restore-history panels in the Site
 * Content Backup section. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const [{ data: exports, error: exportsError }, { data: restores, error: restoresError }] = await Promise.all([
    supabase
      .from("content_backup_exports")
      .select("id, filename, size_bytes, backup_version, tables, warnings, created_by_email, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("backup_restores")
      .select("id, filename, status, row_counts, warnings, error, backup_version, started_at, finished_at")
      .eq("kind", "content")
      .order("started_at", { ascending: false })
      .limit(20),
  ]);

  if (exportsError || restoresError) {
    return NextResponse.json({ error: "Failed to load backup history." }, { status: 500 });
  }

  return NextResponse.json({
    exports: exports ?? [],
    restores: restores ?? [],
    lastExport: exports?.[0] ?? null,
  });
}
