import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { logAdminAction } from "@/lib/supabase/admin-action-log";

const SAFE_FILENAME_RE = /^[\w.\-:]+$/;

const paramsSchema = z.object({
  name: z.string().min(1).max(200).regex(SAFE_FILENAME_RE, "Backup name contains disallowed characters."),
});

/** GET /api/admin/backup/content/:name — short-lived signed URL to
 * download a previously generated content backup file. */
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid backup name." }, { status: 400 });
  }

  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data, error } = await supabase.storage
    .from("content-backups")
    .createSignedUrl(parsedParams.data.name, 60, { download: parsedParams.data.name });
  if (error || !data) {
    return NextResponse.json({ error: "Failed to create download link." }, { status: 500 });
  }
  return NextResponse.json({ url: data.signedUrl });
}

/** DELETE /api/admin/backup/content/:name */
export async function DELETE(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid backup name." }, { status: 400 });
  }

  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const { error } = await supabase.storage.from("content-backups").remove([parsedParams.data.name]);
  if (error) {
    return NextResponse.json({ error: "Failed to delete backup." }, { status: 500 });
  }

  // The file is gone from storage — also drop its history row, otherwise
  // "Last backup" stats and the export list keep pointing at a file that
  // no longer exists (a re-download attempt would just 404).
  await supabase.from("content_backup_exports").delete().eq("filename", parsedParams.data.name);

  await logAdminAction(supabase, user, {
    action: "content_backup_deleted",
    targetType: "content_backup",
    targetId: parsedParams.data.name,
    summary: `Deleted content backup file "${parsedParams.data.name}".`,
  });

  return NextResponse.json({ ok: true });
}
