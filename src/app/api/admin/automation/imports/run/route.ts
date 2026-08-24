import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { runImportSchema, firstIssueMessage } from "@/lib/validation";
import { runProviderImport } from "@/lib/automation/import";
import { apiError } from "@/lib/api-error";

export const maxDuration = 60;

/** POST /api/admin/automation/imports/run — "Run import now" for a single
 * provider from the Imports admin page. Records the run under the
 * `auto_import_games` job key so it shows up in the same Task Queue &
 * Job Logs / Import History view as scheduled runs. */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = runImportSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { data: provider, error: providerError } = await supabase
    .from("import_providers")
    .select("*")
    .eq("id", parsed.data.providerId)
    .maybeSingle();
  if (providerError) {
    return apiError(providerError);
  }
  if (!provider) {
    return NextResponse.json({ error: "Provider not found." }, { status: 404 });
  }

  const { data: rule } = await supabase.from("import_rules").select("*").eq("provider_id", provider.id).maybeSingle();

  const { data: run, error: runError } = await supabase
    .from("automation_job_runs")
    .insert({ job_key: "auto_import_games", status: "running", triggered_by: "manual", triggered_by_user: user.id })
    .select("id, started_at")
    .single();
  if (runError || !run) {
    return apiError(runError, "Could not start the import.");
  }

  const outcome = await runProviderImport(supabase, provider, rule ?? null);
  const finishedAt = new Date();

  await supabase
    .from("automation_job_runs")
    .update({
      status: outcome.status,
      finished_at: finishedAt.toISOString(),
      duration_ms: finishedAt.getTime() - new Date(run.started_at).getTime(),
      items_processed: outcome.itemsProcessed,
      items_ok: outcome.itemsOk,
      items_failed: outcome.itemsFailed,
      summary: outcome.summary,
      error: outcome.error ?? null,
    })
    .eq("id", run.id);

  return NextResponse.json({ runId: run.id, outcome });
}
