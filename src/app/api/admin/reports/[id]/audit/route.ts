import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/supabase/route-auth";

const paramsSchema = z.object({ id: z.string().uuid() });

/** GET /api/admin/reports/:id/audit — full audit trail for one case
 * (status/assignment/priority/category changes, notes, actions taken). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid report id." }, { status: 400 });
  }

  const auth = await requirePermission("manage_reports").then(async (r) =>
    r.ok ? r : requirePermission("manage_copyright")
  );
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from("report_audit_log")
    .select("*")
    .eq("report_id", parsedParams.data.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load audit log." }, { status: 500 });
  }

  const actorIds = [...new Set((data ?? []).map((e) => e.actor_id).filter(Boolean))];
  const { data: profiles } = actorIds.length
    ? await supabase.from("profiles").select("id, name").in("id", actorIds)
    : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name]));

  const entries = (data ?? []).map((e) => ({ ...e, actor_name: e.actor_id ? nameById.get(e.actor_id) ?? "Unknown" : "System" }));

  return NextResponse.json({ entries });
}
