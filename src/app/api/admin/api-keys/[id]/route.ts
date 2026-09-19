import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { logAdminAction } from "@/lib/supabase/admin-action-log";

const paramsSchema = z.object({ id: z.string().uuid() });

/** PATCH /api/admin/api-keys/:id — revoke a key (soft delete: sets
 * revoked_at, keeps the row and its usage history). */
export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid key id." }, { status: 400 });
  }

  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const { data: existing } = await supabase
    .from("api_keys")
    .select("label")
    .eq("id", parsedParams.data.id)
    .maybeSingle();

  const { error } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", parsedParams.data.id);

  if (error) {
    return NextResponse.json({ error: "Failed to revoke API key." }, { status: 500 });
  }

  await logAdminAction(supabase, user, {
    action: "api_key_revoked",
    targetType: "api_key",
    targetId: parsedParams.data.id,
    summary: existing ? `Revoked API key "${existing.label}".` : "Revoked an API key.",
  });

  return NextResponse.json({ ok: true });
}

/** DELETE /api/admin/api-keys/:id — permanently removes the row. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid key id." }, { status: 400 });
  }

  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const { data: existing } = await supabase
    .from("api_keys")
    .select("label")
    .eq("id", parsedParams.data.id)
    .maybeSingle();

  const { error } = await supabase.from("api_keys").delete().eq("id", parsedParams.data.id);
  if (error) {
    return NextResponse.json({ error: "Failed to delete API key." }, { status: 500 });
  }

  await logAdminAction(supabase, user, {
    action: "api_key_deleted",
    targetType: "api_key",
    targetId: parsedParams.data.id,
    summary: existing ? `Deleted API key "${existing.label}".` : "Deleted an API key.",
  });

  return NextResponse.json({ ok: true });
}
