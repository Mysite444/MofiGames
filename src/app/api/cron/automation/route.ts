import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/admin-client";
import { runJob } from "@/lib/automation/run-job";
import { apiError } from "@/lib/api-error";

// This is the URL an external scheduler (Vercel Cron, cron-job.org,
// GitHub Actions, etc.) hits — there's no admin browser session here, so
// it's protected by a shared secret instead of requireAdmin(), and uses
// the service-role client to bypass RLS the same way session management
// does. Configure the scheduler to call this once a minute and send
// `Authorization: Bearer <CRON_SECRET>` (or `?secret=<CRON_SECRET>`);
// each job then runs on its own schedule (automation_jobs.schedule_cron),
// not on every tick of this endpoint.
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Automation cron isn't configured — set CRON_SECRET in the deployment environment." },
      { status: 501 }
    );
  }

  const url = new URL(request.url);
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("secret");
  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = getServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Automation cron isn't configured — set SUPABASE_SERVICE_ROLE_KEY in the deployment environment." },
      { status: 501 }
    );
  }

  const nowIso = new Date().toISOString();
  const { data: due, error } = await supabase
    .from("automation_jobs")
    .select("key")
    .eq("enabled", true)
    .or(`next_run_at.is.null,next_run_at.lte.${nowIso}`);

  if (error) {
    return apiError(error);
  }

  const results: { key: string; status?: string; error?: string }[] = [];
  for (const job of due ?? []) {
    try {
      const { outcome } = await runJob(supabase, job.key, "cron");
      results.push({ key: job.key, status: outcome.status });
    } catch (err) {
      results.push({ key: job.key, error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  return NextResponse.json({ ranAt: nowIso, jobsRun: results.length, results });
}
