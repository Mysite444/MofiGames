import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { logAdminAction } from "@/lib/supabase/admin-action-log";
import { contentBackupExportOptionsSchema, firstIssueMessage } from "@/lib/validation";
import { exportContentTables } from "@/lib/backup/content-backup";
import { CONTENT_TABLES } from "@/lib/backup/content-tables";

export const maxDuration = 60;

/** POST /api/admin/backup/content/export — "Download Content Backup".
 * Builds the backup server-side and uploads it directly to the
 * content-backups bucket rather than streaming the JSON through the
 * response body, so this isn't bounded by a browser request's payload
 * size for a large site — the browser only ever receives a filename and
 * a short-lived signed download URL. */
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
  const parsed = contentBackupExportOptionsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const tables = parsed.data.tables ?? CONTENT_TABLES;
  const invalidTables = tables.filter((t) => !CONTENT_TABLES.includes(t));
  if (invalidTables.length > 0) {
    return NextResponse.json({ error: `Not a recognized content table: ${invalidTables.join(", ")}` }, { status: 400 });
  }

  let result;
  try {
    result = await exportContentTables(tables);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Content backup export failed." }, { status: 500 });
  }

  const { file, warnings } = result;
  const jsonBody = JSON.stringify(file);
  const sizeBytes = new TextEncoder().encode(jsonBody).length;
  const filename = `content-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;

  const { error: uploadError } = await supabase.storage
    .from("content-backups")
    .upload(filename, jsonBody, { contentType: "application/json", upsert: false });
  if (uploadError) {
    return NextResponse.json({ error: `Backup was built but could not be saved: ${uploadError.message}` }, { status: 500 });
  }

  await supabase.from("content_backup_exports").insert({
    filename,
    size_bytes: sizeBytes,
    backup_version: file.manifest.backupVersion,
    tables: Object.fromEntries(file.manifest.tables.map((t) => [t.name, t.rowCount])),
    warnings,
    created_by: user.id,
    created_by_email: user.email ?? null,
  });

  await logAdminAction(supabase, user, {
    action: "content_backup_created",
    targetType: "content_backup",
    targetId: filename,
    summary: `Created content backup "${filename}" (${file.manifest.tables.length} tables, ${sizeBytes.toLocaleString()} bytes).`,
    metadata: { tables: file.manifest.tables, warnings },
  });

  const { data: signed } = await supabase.storage.from("content-backups").createSignedUrl(filename, 60);

  return NextResponse.json({
    filename,
    sizeBytes,
    backupVersion: file.manifest.backupVersion,
    tables: file.manifest.tables,
    warnings,
    downloadUrl: signed?.signedUrl ?? null,
  });
}
