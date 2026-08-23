import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { restoreBackupSchema, firstIssueMessage } from "@/lib/validation";
import { backupEncryptionEnabled, decryptBackup } from "@/lib/backup-crypto";
import { logAdminAction } from "@/lib/supabase/admin-action-log";

/** Primary key column each backed-up table upserts on conflict against.
 * Every other table in a backup is keyed by `id`; categories is the one
 * exception (its primary key is `slug`, see migration 0002). */
const CONFLICT_KEY: Record<string, string> = {
  games: "id",
  categories: "slug",
  tags: "id",
  pages: "id",
  posts: "id",
};

/** POST /api/admin/security/backups/restore — One-Click Restore. Reads a
 * backup file, decrypts it if needed, and upserts every row it contains
 * back into the matching tables (conflict on primary key: update the row
 * if it still exists, insert it if it doesn't).
 *
 * This is a *merge*, not a full point-in-time revert: a row created or
 * changed after the backup was taken, and not present in the backup,
 * is left alone — restore never deletes anything. That's a deliberate,
 * safer default for "undo a mistake" over "wipe and replace", but it
 * does mean this can't undo a deletion by itself; re-run against an
 * earlier backup by hand for that. */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const parsed = restoreBackupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const { filename, tables: onlyTables } = parsed.data;

  const { data: restoreRow } = await supabase
    .from("backup_restores")
    .insert({ filename, restored_by: user.id, status: "running" })
    .select("id")
    .single();

  try {
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("automation-backups")
      .download(filename);
    if (downloadError || !fileData) throw new Error("Couldn't download that backup file.");

    const buffer = Buffer.from(await fileData.arrayBuffer());
    let jsonText: string;
    if (filename.endsWith(".enc")) {
      if (!backupEncryptionEnabled()) {
        throw new Error("This backup is encrypted, but BACKUP_ENCRYPTION_KEY isn't set on the server.");
      }
      jsonText = decryptBackup(buffer);
    } else {
      jsonText = buffer.toString("utf8");
    }

    const parsedBackup = JSON.parse(jsonText) as { tables?: Record<string, unknown[]> };
    const tableData = parsedBackup.tables ?? {};
    const tableNames = (onlyTables ?? Object.keys(tableData)).filter((t) => t in CONFLICT_KEY);

    const rowCounts: Record<string, number> = {};
    const failures: string[] = [];

    for (const table of tableNames) {
      const rows = tableData[table];
      if (!Array.isArray(rows) || rows.length === 0) {
        rowCounts[table] = 0;
        continue;
      }
      let restored = 0;
      // Chunked to stay well under any request-size limit on a large backup.
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await supabase.from(table).upsert(chunk, { onConflict: CONFLICT_KEY[table] });
        if (error) {
          failures.push(`${table}: ${error.message}`);
          break;
        }
        restored += chunk.length;
      }
      rowCounts[table] = restored;
    }

    const status = failures.length === 0 ? "success" : failures.length === tableNames.length ? "failed" : "partial";

    if (restoreRow) {
      await supabase
        .from("backup_restores")
        .update({ status, row_counts: rowCounts, error: failures.join("; ") || null, finished_at: new Date().toISOString() })
        .eq("id", restoreRow.id);
    }

    await supabase.from("security_alerts").insert({
      type: "database_restored",
      severity: status === "failed" ? "critical" : "warning",
      user_id: user.id,
      message: `${user.email ?? "An admin"} restored from backup "${filename}" (${status}).`,
      metadata: { filename, rowCounts, failures },
    });

    await logAdminAction(supabase, user, {
      action: "backup_restored",
      targetType: "backup",
      targetId: filename,
      summary: `Restored from backup "${filename}" (${status}).`,
      metadata: { filename, rowCounts, failures, status },
    });

    if (status === "failed") {
      return NextResponse.json({ error: failures.join("; ") || "Restore failed." }, { status: 500 });
    }
    return NextResponse.json({ status, rowCounts, failures });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Restore failed.";
    if (restoreRow) {
      await supabase
        .from("backup_restores")
        .update({ status: "failed", error: message, finished_at: new Date().toISOString() })
        .eq("id", restoreRow.id);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
