import type { SupabaseClient } from "@supabase/supabase-js";
import { JOB_REGISTRY } from "./registry";
import { nextRunAfter } from "./cron";
import { notifyJobFailure } from "./notify";
import type { JobRunOutcome } from "./types";

export interface RunJobResult {
  runId: string;
  outcome: JobRunOutcome;
}

/** Runs one automation job end-to-end: opens a run row, executes the
 * registered executor (if any), closes the run row with the outcome,
 * updates the job's last_run_at/last_status/next_run_at, and fires a
 * failure notification when applicable. Used by both the manual "Run
 * now" API route and the cron endpoint — the only difference between
 * them is `triggeredBy`. */
export async function runJob(
  supabase: SupabaseClient,
  jobKey: string,
  triggeredBy: "manual" | "cron",
  triggeredByUserId?: string
): Promise<RunJobResult> {
  const { data: job, error: jobError } = await supabase.from("automation_jobs").select("*").eq("key", jobKey).single();
  if (jobError || !job) {
    throw new Error(`Unknown automation job "${jobKey}".`);
  }

  const { data: run, error: runError } = await supabase
    .from("automation_job_runs")
    .insert({ job_key: jobKey, status: "running", triggered_by: triggeredBy, triggered_by_user: triggeredByUserId ?? null })
    .select("id, started_at")
    .single();
  if (runError || !run) {
    throw new Error(runError?.message ?? "Could not create a run record.");
  }

  const executor = JOB_REGISTRY[jobKey];
  const startedAt = new Date(run.started_at).getTime();

  let outcome: JobRunOutcome;
  if (!executor) {
    outcome = {
      status: "success",
      itemsProcessed: 0,
      itemsOk: 0,
      itemsFailed: 0,
      summary: { note: "This job has no automatic run step — it only stores configuration used by other jobs." },
    };
  } else {
    try {
      outcome = await executor(supabase, (job.config ?? {}) as Record<string, unknown>);
    } catch (err) {
      outcome = {
        status: "failed",
        itemsProcessed: 0,
        itemsOk: 0,
        itemsFailed: 0,
        summary: {},
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt;

  await supabase
    .from("automation_job_runs")
    .update({
      status: outcome.status,
      finished_at: finishedAt.toISOString(),
      duration_ms: durationMs,
      items_processed: outcome.itemsProcessed,
      items_ok: outcome.itemsOk,
      items_failed: outcome.itemsFailed,
      summary: outcome.summary,
      error: outcome.error ?? null,
    })
    .eq("id", run.id);

  const nextRun = nextRunAfter(job.schedule_cron, finishedAt);
  await supabase
    .from("automation_jobs")
    .update({
      last_run_at: finishedAt.toISOString(),
      last_status: outcome.status,
      last_summary: outcome.summary,
      next_run_at: nextRun?.toISOString() ?? null,
    })
    .eq("key", jobKey);

  if (outcome.status === "failed") {
    await notifyJobFailure(supabase, jobKey, job.name, run.id, outcome.error ?? "Unknown error");
  }

  return { runId: run.id, outcome };
}
