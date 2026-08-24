import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { logAdminAction } from "@/lib/supabase/admin-action-log";
import { migrationExportOptionsSchema, firstIssueMessage } from "@/lib/validation";
import { buildMigrationZip } from "@/lib/backup/migration-export";

export const maxDuration = 60;

/** POST /api/admin/backup/migration/export — "Download Complete
 * Migration". Builds the ZIP server-side (app source + schema SQL +
 * database data + storage manifest) and uploads it directly to the
 * site-migrations bucket, same reasoning as the content backup export:
 * the browser only ever gets a signed URL, never the ZIP bytes through
 * this request/response cycle.
 *
 * A large project's ZIP build (especially with storage files included)
 * can be slow — see the migration report's Limitations section for
 * `maxDuration` and how to raise it if a given site outgrows 60s. */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = migrationExportOptionsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { data: runRow } = await supabase
    .from("site_migration_runs")
    .insert({ kind: "export", status: "running", created_by: user.id, created_by_email: user.email ?? null })
    .select("id")
    .single();

  try {
    const { zipBuffer, manifest, warnings } = await buildMigrationZip(supabase, {
      projectRoot: process.cwd(),
      includeStorageFiles: parsed.data.includeStorageFiles,
    });

    const filename = `site-migration-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
    const { error: uploadError } = await supabase.storage
      .from("site-migrations")
      .upload(filename, zipBuffer, { contentType: "application/zip", upsert: false });
    if (uploadError) {
      throw new Error(`Migration package was built but could not be saved: ${uploadError.message}`);
    }

    if (runRow) {
      await supabase
        .from("site_migration_runs")
        .update({
          status: "success",
          filename,
          size_bytes: zipBuffer.length,
          manifest,
          row_counts: Object.fromEntries(manifest.includedTables.map((t) => [t.name, t.rowCount])),
          storage_buckets: manifest.includedStorageBuckets,
          warnings,
          finished_at: new Date().toISOString(),
        })
        .eq("id", runRow.id);
    }

    await logAdminAction(supabase, user, {
      action: "site_migration_exported",
      targetType: "site_migration",
      targetId: filename,
      summary: `Generated Complete Site Migration package "${filename}" (${manifest.includedTables.length} tables, ${manifest.includedStorageBuckets.length} storage buckets, ${(zipBuffer.length / 1024 / 1024).toFixed(1)}MB).`,
      metadata: { manifest, warnings },
    });

    const { data: signed } = await supabase.storage.from("site-migrations").createSignedUrl(filename, 60);

    return NextResponse.json({
      filename,
      sizeBytes: zipBuffer.length,
      manifest,
      warnings,
      downloadUrl: signed?.signedUrl ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Migration export failed.";
    if (runRow) {
      await supabase.from("site_migration_runs").update({ status: "failed", error: message, finished_at: new Date().toISOString() }).eq("id", runRow.id);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
