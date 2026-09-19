// Client-side fetch helpers for Admin → Automation. Every write goes
// through /api/admin/automation/* (see comment atop admin-content.ts for
// why: server-side zod validation + clear errors on top of RLS). Kept in
// its own file rather than folded into admin-content.ts, which is already
// large, since automation is a self-contained feature area.

async function parseJsonOrThrow(response: Response): Promise<unknown> {
  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    // no body / not JSON
  }
  if (!response.ok) {
    const message =
      json && typeof json === "object" && "error" in json && typeof (json as { error?: unknown }).error === "string"
        ? (json as { error: string }).error
        : `Request failed (${response.status}).`;
    throw new Error(message);
  }
  return json;
}

export interface AutomationJob {
  key: string;
  name: string;
  category: string;
  description: string;
  enabled: boolean;
  schedule_cron: string;
  config: Record<string, unknown>;
  last_run_at: string | null;
  last_status: "running" | "success" | "partial" | "failed" | null;
  last_summary: Record<string, unknown> | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationJobRun {
  id: string;
  job_key: string;
  status: "running" | "success" | "partial" | "failed";
  triggered_by: "manual" | "cron";
  triggered_by_user: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  items_processed: number;
  items_ok: number;
  items_failed: number;
  summary: Record<string, unknown>;
  error: string | null;
}

export interface JobRunOutcome {
  status: "success" | "partial" | "failed";
  itemsProcessed: number;
  itemsOk: number;
  itemsFailed: number;
  summary: Record<string, unknown>;
  error?: string;
}

export interface AutomationNotification {
  id: string;
  job_key: string;
  run_id: string | null;
  level: "info" | "error";
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface ImportProvider {
  id: string;
  name: string;
  slug: string;
  feed_url: string;
  field_map: Record<string, string>;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  rule: ImportRule | null;
}

export interface ImportRule {
  id: string;
  provider_id: string;
  schedule_cron: string | null;
  auto_publish: boolean;
  skip_duplicate_games: boolean;
  auto_update_existing_games: boolean;
  default_category_slug: string | null;
  default_tag_ids: string[];
  max_items_per_run: number;
  max_retries: number;
}

export async function fetchAutomationJobs(): Promise<AutomationJob[]> {
  const res = await fetch("/api/admin/automation/jobs");
  const json = (await parseJsonOrThrow(res)) as { jobs: AutomationJob[] };
  return json.jobs;
}

export async function updateAutomationJob(
  key: string,
  updates: Partial<Pick<AutomationJob, "enabled" | "schedule_cron">> & { config?: Record<string, unknown> }
): Promise<AutomationJob> {
  const res = await fetch(`/api/admin/automation/jobs/${key}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  const json = (await parseJsonOrThrow(res)) as { job: AutomationJob };
  return json.job;
}

export async function runAutomationJob(key: string): Promise<{ runId: string; outcome: JobRunOutcome }> {
  const res = await fetch(`/api/admin/automation/jobs/${key}/run`, { method: "POST" });
  return (await parseJsonOrThrow(res)) as { runId: string; outcome: JobRunOutcome };
}

export async function fetchAutomationRuns(params: {
  page?: number;
  jobKey?: string;
  status?: string;
}): Promise<{ runs: AutomationJobRun[]; total: number; page: number; pageSize: number }> {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.jobKey) search.set("jobKey", params.jobKey);
  if (params.status) search.set("status", params.status);
  const res = await fetch(`/api/admin/automation/runs?${search.toString()}`);
  return (await parseJsonOrThrow(res)) as { runs: AutomationJobRun[]; total: number; page: number; pageSize: number };
}

export async function fetchAutomationNotifications(unreadOnly = false): Promise<AutomationNotification[]> {
  const res = await fetch(`/api/admin/automation/notifications${unreadOnly ? "?unreadOnly=1" : ""}`);
  const json = (await parseJsonOrThrow(res)) as { notifications: AutomationNotification[] };
  return json.notifications;
}

export async function markNotificationsRead(ids: string[]): Promise<void> {
  await fetch("/api/admin/automation/notifications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  }).then(parseJsonOrThrow);
}

export async function fetchImportProviders(): Promise<ImportProvider[]> {
  const res = await fetch("/api/admin/automation/imports/providers");
  const json = (await parseJsonOrThrow(res)) as { providers: ImportProvider[] };
  return json.providers;
}

export async function createImportProvider(input: {
  name: string;
  slug: string;
  feed_url: string;
  field_map?: Record<string, string>;
  enabled?: boolean;
}): Promise<ImportProvider> {
  const res = await fetch("/api/admin/automation/imports/providers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await parseJsonOrThrow(res)) as { provider: ImportProvider };
  return json.provider;
}

export async function updateImportProvider(id: string, updates: Record<string, unknown>): Promise<ImportProvider> {
  const res = await fetch(`/api/admin/automation/imports/providers/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  const json = (await parseJsonOrThrow(res)) as { provider: ImportProvider };
  return json.provider;
}

export async function deleteImportProvider(id: string): Promise<void> {
  await fetch(`/api/admin/automation/imports/providers/${id}`, { method: "DELETE" }).then(parseJsonOrThrow);
}

export async function upsertImportRule(input: {
  provider_id: string;
  schedule_cron?: string | null;
  auto_publish: boolean;
  skip_duplicate_games: boolean;
  auto_update_existing_games: boolean;
  default_category_slug?: string | null;
  default_tag_ids?: string[];
  max_items_per_run: number;
  max_retries: number;
}): Promise<ImportRule> {
  const res = await fetch("/api/admin/automation/imports/rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await parseJsonOrThrow(res)) as { rule: ImportRule };
  return json.rule;
}

export async function runImportProvider(providerId: string): Promise<{ runId: string; outcome: JobRunOutcome }> {
  const res = await fetch("/api/admin/automation/imports/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ providerId }),
  });
  return (await parseJsonOrThrow(res)) as { runId: string; outcome: JobRunOutcome };
}
