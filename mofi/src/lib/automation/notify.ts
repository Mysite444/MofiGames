import type { SupabaseClient } from "@supabase/supabase-js";

/** Called after any job run that fails. Always writes an in-app
 * notification (shown on the Automation dashboard); additionally posts to
 * a webhook if one is configured on the `email_notifications` job — a
 * generic Slack/Discord-compatible POST, since sending real email needs
 * an SMTP/API provider this project doesn't currently have credentials
 * for. Actual email delivery can be wired in here later without changing
 * any call site. */
export async function notifyJobFailure(
  supabase: SupabaseClient,
  jobKey: string,
  jobName: string,
  runId: string,
  errorMessage: string
): Promise<void> {
  await supabase.from("automation_notifications").insert({
    job_key: jobKey,
    run_id: runId,
    level: "error",
    message: `${jobName} failed: ${errorMessage}`,
  });

  const { data: notifJob } = await supabase.from("automation_jobs").select("config").eq("key", "email_notifications").maybeSingle();
  const config = (notifJob?.config ?? {}) as { email?: string; webhookUrl?: string };

  if (config.webhookUrl) {
    try {
      await fetch(config.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `⚠️ MofiGames automation job "${jobName}" failed: ${errorMessage}`,
          jobKey,
          runId,
        }),
      });
    } catch {
      // Best-effort — a broken webhook shouldn't fail the job run itself.
    }
  }
  // config.email is stored for future SMTP/email-API integration; no
  // delivery mechanism is wired up yet, so it's intentionally unused here.
}
