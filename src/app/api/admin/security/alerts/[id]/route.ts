import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { resolveSecurityAlertSchema, firstIssueMessage } from "@/lib/validation";

const paramsSchema = z.object({ id: z.string().uuid() });

/** PATCH /api/admin/security/alerts/:id — mark a security alert
 * resolved/unresolved. Admin-only. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid alert id." }, { status: 400 });
  }

  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const parsed = resolveSecurityAlertSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("security_alerts")
    .update({
      resolved: parsed.data.resolved,
      resolved_by: parsed.data.resolved ? user.id : null,
      resolved_at: parsed.data.resolved ? new Date().toISOString() : null,
    })
    .eq("id", parsedParams.data.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update alert." }, { status: 500 });
  }

  return NextResponse.json({ alert: data });
}
