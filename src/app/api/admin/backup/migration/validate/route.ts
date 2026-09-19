import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { migrationUploadRefSchema, firstIssueMessage } from "@/lib/validation";
import { parseAndValidateMigrationZip, planMigrationRestore, MigrationValidationError } from "@/lib/backup/migration-import";
import { getDatabaseSchemaVersion } from "@/lib/backup/manifest";

export const maxDuration = 60;

/** POST /api/admin/backup/migration/validate — downloads a previously
 * uploaded migration ZIP (by storage key, staged by the browser
 * directly into the site-migrations bucket under "uploads/"), unzips
 * and validates it, and returns the full restore preview — without
 * writing anything. Required "show the administrator exactly what will
 * be restored" step before Upload Complete Migration can proceed. */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const parsed = migrationUploadRefSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { data: fileData, error: downloadError } = await supabase.storage
    .from("site-migrations")
    .download(parsed.data.storageKey);
  if (downloadError || !fileData) {
    return NextResponse.json({ error: "Couldn't read the uploaded file. Try uploading it again." }, { status: 400 });
  }

  try {
    const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
    const filenames = await fs.readdir(migrationsDir);
    const currentSchemaVersion = await getDatabaseSchemaVersion(filenames);

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const zipParsed = await parseAndValidateMigrationZip(buffer, currentSchemaVersion);
    const plan = await planMigrationRestore(supabase, zipParsed);

    return NextResponse.json({
      ok: true,
      manifest: zipParsed.manifest,
      schemaFileCount: zipParsed.schemaFileCount,
      appFileCount: zipParsed.appFileCount,
      hasStorageFiles: zipParsed.hasStorageFiles,
      storageBuckets: zipParsed.storageBuckets,
      currentSchemaVersion,
      order: plan.order,
      rowPlan: plan.rowPlan,
      bucketsToCreate: plan.bucketsToCreate,
      warnings: plan.warnings,
    });
  } catch (err) {
    if (err instanceof MigrationValidationError) {
      return NextResponse.json({ ok: false, errors: err.errors, warnings: err.warnings }, { status: 200 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Validation failed." }, { status: 500 });
  }
}
