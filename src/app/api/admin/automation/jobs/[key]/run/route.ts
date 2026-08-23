import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { runJob } from "@/lib/automation/run-job";
import { apiError } from "@/lib/api-error";

const paramsSchema = z.object({ key: z.string().min(1).max(80) });

// Health/media checks fan out real network requests across the whole
// catalog — give this route the same headroom as the content-health
// check-links route it shares logic with.
export const maxDuration = 60;

/** POST /api/admin/automation/jobs/:key/run — "Run now" from the
 * Automation dashboard. Executes synchronously and returns the result;
 * the run is also recorded in automation_job_runs regardless of whether
 * this request completes (Task Queue & Job Logs). */
export async function POST(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid job key." }, { status: 400 });
  }

  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  try {
    const result = await runJob(supabase, parsedParams.data.key, "manual", user.id);
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err, "Job run failed.");
  }
}
