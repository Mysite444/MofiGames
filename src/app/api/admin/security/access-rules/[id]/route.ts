import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { logAdminAction } from "@/lib/supabase/admin-action-log";

const paramsSchema = z.object({ id: z.string().uuid() });

/** DELETE /api/admin/security/access-rules/:id */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid rule id." }, { status: 400 });
  }

  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const { data: existing } = await supabase
    .from("access_rules")
    .select("rule_type, mode, value")
    .eq("id", parsedParams.data.id)
    .maybeSingle();

  const { error } = await supabase.from("access_rules").delete().eq("id", parsedParams.data.id);
  if (error) {
    return NextResponse.json({ error: "Failed to remove access rule." }, { status: 500 });
  }

  await logAdminAction(supabase, user, {
    action: "access_rule_deleted",
    targetType: "access_rule",
    targetId: parsedParams.data.id,
    summary: existing
      ? `Removed ${existing.mode} rule for ${existing.rule_type} "${existing.value}".`
      : "Removed an access rule.",
    metadata: existing ?? {},
  });

  return NextResponse.json({ ok: true });
}
