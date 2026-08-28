import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { getTableCatalog, classifyTables } from "@/lib/backup/schema-catalog";
import { CONTENT_TABLE_GROUPS, EXCLUDED_TABLE_REASONS } from "@/lib/backup/content-tables";

/** GET /api/admin/backup/content/catalog — "what will be backed up"
 * preview, computed from the live database schema (admin_table_catalog
 * RPC), not from a hardcoded table list. Powers the audit view in the
 * Site Content Backup UI. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  let classified;
  try {
    const catalog = await getTableCatalog(supabase);
    classified = classifyTables(catalog);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to read the database schema catalog." },
      { status: 500 }
    );
  }

  const groups = CONTENT_TABLE_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    description: group.description,
    tables: group.tables.map((name) => {
      const t = classified.content.find((c) => c.tableName === name);
      return { name, estimatedRows: t?.estimatedRows ?? null, existsInSchema: Boolean(t) };
    }),
  }));

  return NextResponse.json({
    groups,
    missingFromRegistry: classified.missingFromRegistry,
    needsReview: classified.needsReview.map((t) => ({ name: t.tableName, estimatedRows: t.estimatedRows })),
    excludedCount: classified.infra.length,
    excludedReasons: EXCLUDED_TABLE_REASONS,
  });
}
