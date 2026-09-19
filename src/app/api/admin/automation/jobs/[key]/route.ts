import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { automationJobUpdateSchema, firstIssueMessage } from "@/lib/validation";
import { nextRunAfter } from "@/lib/automation/cron";
import { apiError } from "@/lib/api-error";

const paramsSchema = z.object({ key: z.string().min(1).max(80) });

/** PATCH /api/admin/automation/jobs/:key — toggle enabled, edit the cron
 * schedule, or update job-specific config (e.g. retention days, webhook
 * URL). This is the Cron Job Manager's write path. */
export async function PATCH(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid job key." }, { status: 400 });
  }

  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsedBody = automationJobUpdateSchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: firstIssueMessage(parsedBody.error) }, { status: 400 });
  }
  if (Object.keys(parsedBody.data).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  const updates: Record<string, unknown> = { ...parsedBody.data };
  // Merge config rather than overwrite, so the client can send just the
  // one field it changed without wiping out the rest.
  if (parsedBody.data.config) {
    const { data: existing } = await supabase
      .from("automation_jobs")
      .select("config")
      .eq("key", parsedParams.data.key)
      .maybeSingle();
    updates.config = { ...(existing?.config ?? {}), ...parsedBody.data.config };
  }

  // Recompute next_run_at if the schedule or enabled state changed.
  if (parsedBody.data.schedule_cron || parsedBody.data.enabled !== undefined) {
    const { data: job } = await supabase
      .from("automation_jobs")
      .select("schedule_cron, enabled")
      .eq("key", parsedParams.data.key)
      .maybeSingle();
    const enabled = parsedBody.data.enabled ?? job?.enabled ?? true;
    const cron = parsedBody.data.schedule_cron ?? job?.schedule_cron;
    updates.next_run_at = enabled && cron ? nextRunAfter(cron)?.toISOString() ?? null : null;
  }

  const { data, error } = await supabase
    .from("automation_jobs")
    .update(updates)
    .eq("key", parsedParams.data.key)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }
    return apiError(error);
  }

  return NextResponse.json({ job: data });
}
