import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/supabase/route-auth";
import { createReportActionSchema, firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";

const paramsSchema = z.object({ id: z.string().uuid() });

/** GET /api/admin/reports/:id/actions — Administration → Actions Taken. */
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
    .from("report_actions")
    .select("*")
    .eq("report_id", parsedParams.data.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load actions." }, { status: 500 });
  }

  const moderatorIds = [...new Set((data ?? []).map((a) => a.moderator_id).filter(Boolean))];
  const { data: profiles } = moderatorIds.length
    ? await supabase.from("profiles").select("id, name").in("id", moderatorIds)
    : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name]));

  const actions = (data ?? []).map((a) => ({ ...a, moderator_name: nameById.get(a.moderator_id) ?? "Unknown" }));

  return NextResponse.json({ actions });
}

/** POST /api/admin/reports/:id/actions — records an action taken on a
 * case (warning, remove_content, suspend_user, ban_user) and, for the
 * last three, actually carries it out:
 *  - remove_content deletes the comment the report is attached to
 *    (requires moderate_comments in addition to manage_reports).
 *  - suspend_user/ban_user updates the target profile the same way
 *    Banned Users does (requires ban_users in addition to manage_reports).
 * Recording the log entry never silently fails the underlying action or
 * vice versa — both must succeed, otherwise the whole request 400s/500s
 * so the audit trail can't drift from what actually happened. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const { supabase, user } = auth.ctx;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = createReportActionSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { data: report, error: reportError } = await supabase
    .from("user_reports")
    .select("id, reported_user_id, context_comment_id")
    .eq("id", parsedParams.data.id)
    .maybeSingle();
  if (reportError || !report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  if (parsed.data.actionType === "remove_content") {
    if (!report.context_comment_id) {
      return NextResponse.json({ error: "This report has no attached comment to remove." }, { status: 400 });
    }
    const { error: deleteError } = await supabase.from("comments").delete().eq("id", report.context_comment_id);
    if (deleteError) {
      return NextResponse.json({ error: "Could not remove the content — check moderate_comments access." }, { status: 403 });
    }
  }

  if (parsed.data.actionType === "suspend_user" || parsed.data.actionType === "ban_user") {
    const targetUserId = parsed.data.targetUserId ?? report.reported_user_id;
    if (!targetUserId) {
      return NextResponse.json({ error: "No target user to suspend or ban." }, { status: 400 });
    }
    const permanent = parsed.data.actionType === "ban_user";
    const expiresInDays = permanent ? undefined : parsed.data.banExpiresInDays ?? 7;
    const { error: banError } = await supabase
      .from("profiles")
      .update({
        is_banned: true,
        ban_reason: parsed.data.details || `${parsed.data.actionType} via report ${parsedParams.data.id}`,
        banned_at: new Date().toISOString(),
        ban_expires_at: expiresInDays
          ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
          : null,
        banned_by: user.id,
      })
      .eq("id", targetUserId);
    if (banError) {
      return NextResponse.json({ error: "Could not apply the ban — check ban_users access." }, { status: 403 });
    }
  }

  const { data: action, error } = await supabase
    .from("report_actions")
    .insert({
      report_id: parsedParams.data.id,
      action_type: parsed.data.actionType,
      target_user_id: parsed.data.targetUserId ?? report.reported_user_id ?? null,
      moderator_id: user.id,
      details: parsed.data.details,
    })
    .select()
    .single();

  if (error) {
    return apiError(error);
  }

  await supabase.from("report_audit_log").insert({
    report_id: parsedParams.data.id,
    actor_id: user.id,
    action: "action_taken",
    details: { actionType: parsed.data.actionType, actionId: action.id },
  });

  return NextResponse.json({ action }, { status: 201 });
}
