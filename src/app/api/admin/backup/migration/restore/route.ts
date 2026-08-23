import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { migrationRestoreSchema, firstIssueMessage } from "@/lib/validation";
import { parseAndValidateMigrationZip, restoreMigrationData, planMigrationRestore, MigrationValidationError } from "@/lib/backup/migration-import";
import { getDatabaseSchemaVersion } from "@/lib/backup/manifest";
import { logAdminAction } from "@/lib/supabase/admin-action-log";

export const maxDuration = 60;

/** POST /api/admin/backup/migration/restore — "Upload Complete
 * Migration" -> confirm -> restore.
 *
 * Restores ONLY the database-data and (optionally) storage-bucket-config
 * portions of the package — see README_MIGRATION.md inside the ZIP
 * (migration-export.ts) for why application source and schema SQL are
 * deliberately manual steps, not something this route executes. This is
 * the "don't blindly execute arbitrary SQL or files from an uploaded
 * ZIP — only allow controlled migration operations" requirement in
 * practice: the only writes this route performs are the same guarded
 * per-row upsert RPC that Content Backup restore uses, and
 * storage.createBucket() calls for buckets that don't already exist. */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const parsed = migrationRestoreSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const { storageKey, tables: onlyTables, dryRun, createMissingBuckets } = parsed.data;

  const { data: fileData, error: downloadError } = await supabase.storage.from("site-migrations").download(storageKey);
  if (downloadError || !fileData) {
    return NextResponse.json({ error: "Couldn't read the uploaded file. Try uploading it again." }, { status: 400 });
  }

  let zipParsed;
  try {
    const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
    const filenames = await fs.readdir(migrationsDir);
    const currentSchemaVersion = await getDatabaseSchemaVersion(filenames);
    const buffer = Buffer.from(await fileData.arrayBuffer());
    zipParsed = await parseAndValidateMigrationZip(buffer, currentSchemaVersion);
  } catch (err) {
    if (err instanceof MigrationValidationError) {
      return NextResponse.json({ error: err.errors.join(" ") }, { status: 400 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Validation failed." }, { status: 500 });
  }

  const restoreFilename = storageKey.split("/").pop() ?? storageKey;

  let runRowId: string | null = null;
  if (!dryRun) {
    const { data: runRow } = await supabase
      .from("site_migration_runs")
      .insert({
        kind: "import",
        status: "running",
        filename: restoreFilename,
        manifest: zipParsed.manifest,
        created_by: user.id,
        created_by_email: user.email ?? null,
      })
      .select("id")
      .single();
    runRowId = runRow?.id ?? null;
  }

  try {
    if (dryRun) {
      const plan = await planMigrationRestore(supabase, zipParsed);
      return NextResponse.json({ ok: true, dryRun: true, ...plan });
    }

    const result = await restoreMigrationData(supabase, zipParsed, { tables: onlyTables, createMissingBuckets });
    const { dataRestore, bucketsCreated, bucketErrors } = result;

    const status =
      dataRestore.status === "failed" || bucketErrors.length > 0
        ? dataRestore.totals.inserted + dataRestore.totals.updated + dataRestore.totals.skipped + bucketsCreated.length > 0
          ? "partial"
          : "failed"
        : dataRestore.status;

    if (runRowId) {
      const rowCounts = Object.fromEntries(
        dataRestore.results.map((r) => [r.table, { inserted: r.inserted, updated: r.updated, skipped: r.skipped, failed: r.failed }])
      );
      await supabase
        .from("site_migration_runs")
        .update({
          status,
          row_counts: rowCounts,
          storage_buckets: [
            ...bucketsCreated.map((id) => ({ id, created: true })),
            ...bucketErrors.map((b) => ({ id: b.bucket, created: false, error: b.error })),
          ],
          warnings: dataRestore.warnings,
          error: status === "failed" ? "Restore failed — see row_counts/errors for detail." : null,
          finished_at: new Date().toISOString(),
        })
        .eq("id", runRowId);

      await supabase.from("security_alerts").insert({
        type: "database_restored",
        severity: status === "failed" ? "critical" : "warning",
        user_id: user.id,
        message: `${user.email ?? "An admin"} restored a Complete Site Migration package ("${restoreFilename}", ${status}).`,
        metadata: { filename: restoreFilename, totals: dataRestore.totals, bucketsCreated, status },
      });

      await logAdminAction(supabase, user, {
        action: "site_migration_restored",
        targetType: "site_migration",
        targetId: restoreFilename,
        summary: `Restored migration data from "${restoreFilename}" (${status}: +${dataRestore.totals.inserted} inserted, ${dataRestore.totals.updated} updated, ${dataRestore.totals.skipped} skipped, ${dataRestore.totals.failed} failed; ${bucketsCreated.length} storage bucket(s) created).`,
        metadata: { rowCounts, bucketsCreated, bucketErrors, warnings: dataRestore.warnings },
      });

      await supabase.storage.from("site-migrations").remove([storageKey]).catch(() => undefined);
    }

    return NextResponse.json({
      ok: true,
      dryRun: false,
      status,
      results: dataRestore.results,
      totals: dataRestore.totals,
      bucketsCreated,
      bucketErrors,
      warnings: dataRestore.warnings,
      applicationFilesNote:
        "Application source and database schema are not auto-applied — see README_MIGRATION.md inside the package for the manual redeploy/migration steps.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Restore failed.";
    if (runRowId) {
      await supabase.from("site_migration_runs").update({ status: "failed", error: message, finished_at: new Date().toISOString() }).eq("id", runRowId);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
