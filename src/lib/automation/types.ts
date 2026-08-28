import type { SupabaseClient } from "@supabase/supabase-js";

export interface JobRunOutcome {
  status: "success" | "partial" | "failed";
  itemsProcessed: number;
  itemsOk: number;
  itemsFailed: number;
  summary: Record<string, unknown>;
  error?: string;
}

export type JobExecutor = (
  supabase: SupabaseClient,
  config: Record<string, unknown>
) => Promise<JobRunOutcome>;
