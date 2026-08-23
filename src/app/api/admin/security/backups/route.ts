import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";

/** GET /api/admin/security/backups — Admin → Security → Backups. Lists
 * every file in the automation-backups bucket (the same bucket the
 * scheduled_backups automation job writes to — see migration 0016 for
 * the bucket/RLS setup and src/lib/automation/executors.ts for what
 * actually produces a backup). */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data, error } = await supabase.storage
    .from("automation-backups")
    .list("", { limit: 1000, sortBy: { column: "name", order: "desc" } });

  if (error) {
    return NextResponse.json({ error: "Failed to list backups." }, { status: 500 });
  }

  const backups = (data ?? [])
    .filter((f) => f.name !== ".emptyFolderPlaceholder")
    .map((f) => ({
      name: f.name,
      sizeBytes: f.metadata?.size ?? null,
      createdAt: f.created_at,
      encrypted: f.name.endsWith(".enc"),
    }));

  return NextResponse.json({ backups });
}
