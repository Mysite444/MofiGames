import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { logAdminAction } from "@/lib/supabase/admin-action-log";

const SAFE_FILENAME_RE = /^[\w.\-:]+$/;

const paramsSchema = z.object({
  name: z.string().min(1).max(200).regex(SAFE_FILENAME_RE, "Migration package name contains disallowed characters."),
});

/** GET /api/admin/backup/migration/:name — short-lived signed URL to
 * download a previously generated migration ZIP. */
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid migration package name." }, { status: 400 });
  }

  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data, error } = await supabase.storage
    .from("site-migrations")
    .createSignedUrl(parsedParams.data.name, 60, { download: parsedParams.data.name });
  if (error || !data) {
    return NextResponse.json({ error: "Failed to create download link." }, { status: 500 });
  }
  return NextResponse.json({ url: data.signedUrl });
}

/** DELETE /api/admin/backup/migration/:name */
export async function DELETE(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid migration package name." }, { status: 400 });
  }

  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const { error } = await supabase.storage.from("site-migrations").remove([parsedParams.data.name]);
  if (error) {
    return NextResponse.json({ error: "Failed to delete migration package." }, { status: 500 });
  }

  // Only clear the matching "export" run — "import"/"import_dry_run" rows
  // are an audit trail of restores, not files in this bucket, and should
  // stay even after the source package they were built from is deleted.
  await supabase.from("site_migration_runs").delete().eq("kind", "export").eq("filename", parsedParams.data.name);

  await logAdminAction(supabase, user, {
    action: "site_migration_deleted",
    targetType: "site_migration",
    targetId: parsedParams.data.name,
    summary: `Deleted migration package "${parsedParams.data.name}".`,
  });

  return NextResponse.json({ ok: true });
}
