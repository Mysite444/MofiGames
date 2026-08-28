import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { contentBackupUploadRefSchema, firstIssueMessage } from "@/lib/validation";
import { parseAndValidateContentBackup, planContentRestore, BackupValidationError } from "@/lib/backup/content-backup";

export const maxDuration = 60;

/** POST /api/admin/backup/content/validate — downloads a previously
 * uploaded candidate backup (by storage key, staged by the browser
 * directly into the content-backups bucket under "uploads/"), validates
 * its manifest/structure, and returns exactly what a restore would do —
 * without writing anything. This is the required "show a restore
 * summary before modifying the database" step. */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const parsed = contentBackupUploadRefSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { data: fileData, error: downloadError } = await supabase.storage
    .from("content-backups")
    .download(parsed.data.storageKey);
  if (downloadError || !fileData) {
    return NextResponse.json({ error: "Couldn't read the uploaded file. Try uploading it again." }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await fileData.text());
  } catch {
    return NextResponse.json({ error: "That file isn't valid JSON." }, { status: 400 });
  }

  try {
    const { manifest, data, warnings } = parseAndValidateContentBackup(raw);
    const { order, plan, warnings: planWarnings } = await planContentRestore(supabase, data);

    return NextResponse.json({
      ok: true,
      manifest,
      order,
      plan,
      warnings: [...warnings, ...planWarnings],
    });
  } catch (err) {
    if (err instanceof BackupValidationError) {
      return NextResponse.json({ ok: false, errors: err.errors, warnings: err.warnings }, { status: 200 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Validation failed." }, { status: 500 });
  }
}
