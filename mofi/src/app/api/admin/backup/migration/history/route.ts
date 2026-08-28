import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";

/** GET /api/admin/backup/migration/history — powers the "Last migration
 * package / Package size / App version / DB version / Storage included
 * / Migration status" panel. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data: runs, error } = await supabase
    .from("site_migration_runs")
    .select("id, kind, status, filename, size_bytes, manifest, row_counts, storage_buckets, warnings, error, created_by_email, started_at, finished_at")
    .order("started_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: "Failed to load migration history." }, { status: 500 });
  }

  const lastExport = (runs ?? []).find((r) => r.kind === "export" && r.status === "success") ?? null;

  return NextResponse.json({ runs: runs ?? [], lastExport });
}
