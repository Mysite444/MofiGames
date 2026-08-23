import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { getTableCatalog, classifyTables } from "@/lib/backup/schema-catalog";
import { getStorageInventory } from "@/lib/backup/storage-inventory";
import { getApplicationVersion, getNextVersion } from "@/lib/backup/manifest";

/** GET /api/admin/backup/migration/catalog — preview shown before
 * "Download Complete Migration": table row counts plus every storage
 * bucket's object count/size, so the admin can see roughly how big the
 * package (and whether storage files will fit under the inline-file
 * threshold) before generating it. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  try {
    const catalog = await getTableCatalog(supabase);
    const classified = classifyTables(catalog);
    const { buckets, warnings } = await getStorageInventory(supabase);

    return NextResponse.json({
      tables: classified.content.map((t) => ({ name: t.tableName, estimatedRows: t.estimatedRows })),
      storageBuckets: buckets.map((b) => ({ id: b.id, public: b.public, objectCount: b.objects.length, totalBytes: b.totalBytes })),
      totalStorageBytes: buckets.reduce((s, b) => s + b.totalBytes, 0),
      applicationVersion: getApplicationVersion(),
      nextVersion: getNextVersion(),
      warnings,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to build migration catalog preview." }, { status: 500 });
  }
}
