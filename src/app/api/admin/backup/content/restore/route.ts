import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { contentBackupRestoreSchema, firstIssueMessage } from "@/lib/validation";
import { parseAndValidateContentBackup, restoreContentBackup, BackupValidationError } from "@/lib/backup/content-backup";
import { logAdminAction } from "@/lib/supabase/admin-action-log";

export const maxDuration = 60;

/** POST /api/admin/backup/content/restore — "Upload Content Backup" ->
 * confirm -> restore. Expects `storageKey` pointing at a file the
 * browser has already uploaded directly to the content-backups bucket
 * (see ContentBackupSection.tsx) — this route never accepts backup
 * bytes directly in the request body, so it isn't bounded by a
 * serverless request body size limit for a large backup.
 *
 * Mirrors the audit-trail shape of the existing
 * /api/admin/security/backups/restore route (running row -> do the
 * work -> update row, plus a security_alerts entry and an admin action
 * log entry) so restores of either kind show up the same way in
 * Admin → Security → Alerts. */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const parsed = contentBackupRestoreSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const { storageKey, tables: onlyTables, dryRun } = parsed.data;

  const { data: fileData, error: downloadError } = await supabase.storage.from("content-backups").download(storageKey);
  if (downloadError || !fileData) {
    return NextResponse.json({ error: "Couldn't read the uploaded file. Try uploading it again." }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await fileData.text());
  } catch {
    return NextResponse.json({ error: "That file isn't valid JSON." }, { status: 400 });
  }

  let backup: ReturnType<typeof parseAndValidateContentBackup>;
  try {
    backup = parseAndValidateContentBackup(raw);
  } catch (err) {
    if (err instanceof BackupValidationError) {
      return NextResponse.json({ error: err.errors.join(" ") }, { status: 400 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Validation failed." }, { status: 500 });
  }

  const restoreFilename = storageKey.split("/").pop() ?? storageKey;

  let restoreRowId: string | null = null;
  if (!dryRun) {
    const { data: restoreRow } = await supabase
      .from("backup_restores")
      .insert({ filename: restoreFilename, restored_by: user.id, status: "running", kind: "content", backup_version: backup.manifest.backupVersion })
      .select("id")
      .single();
    restoreRowId = restoreRow?.id ?? null;
  }

  try {
    const summary = await restoreContentBackup(supabase, backup.data, { tables: onlyTables, dryRun });

    if (!dryRun && restoreRowId) {
      const rowCounts = Object.fromEntries(
        summary.results.map((r) => [r.table, { inserted: r.inserted, updated: r.updated, skipped: r.skipped, failed: r.failed }])
      );
      await supabase
        .from("backup_restores")
        .update({
          status: summary.status,
          row_counts: rowCounts,
          warnings: [...backup.warnings, ...summary.warnings],
          error: summary.status === "failed" ? "One or more tables failed to restore — see row_counts/errors for detail." : null,
          finished_at: new Date().toISOString(),
        })
        .eq("id", restoreRowId);

      await supabase.from("security_alerts").insert({
        type: "database_restored",
        severity: summary.status === "failed" ? "critical" : "warning",
        user_id: user.id,
        message: `${user.email ?? "An admin"} restored a Site Content Backup ("${restoreFilename}", ${summary.status}).`,
        metadata: { filename: restoreFilename, totals: summary.totals, status: summary.status },
      });

      await logAdminAction(supabase, user, {
        action: "content_backup_restored",
        targetType: "content_backup",
        targetId: restoreFilename,
        summary: `Restored content backup "${restoreFilename}" (${summary.status}: +${summary.totals.inserted} inserted, ${summary.totals.updated} updated, ${summary.totals.skipped} skipped, ${summary.totals.failed} failed).`,
        metadata: { rowCounts, warnings: summary.warnings, tables: onlyTables ?? null },
      });

      // Best-effort cleanup of the staged upload — the audit trail above
      // (backup_restores row) is what persists, not the raw file.
      await supabase.storage.from("content-backups").remove([storageKey]).catch(() => undefined);
    }

    return NextResponse.json({
      ok: true,
      dryRun: Boolean(dryRun),
      status: summary.status,
      order: summary.order,
      plan: summary.plan,
      results: summary.results,
      totals: summary.totals,
      warnings: [...backup.warnings, ...summary.warnings],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Restore failed.";
    if (!dryRun && restoreRowId) {
      await supabase.from("backup_restores").update({ status: "failed", error: message, finished_at: new Date().toISOString() }).eq("id", restoreRowId);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
