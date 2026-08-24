import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/supabase/route-auth";
import { updateReportSchema, firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";

const paramsSchema = z.object({ id: z.string().uuid() });

const STATUS_LABELS: Record<string, string> = {
  pending: "Open",
  reviewed: "Under Review",
  resolved: "Resolved",
  dismissed: "Rejected",
};

/** GET /api/admin/reports/:id — single report/case, used by the detail
 * panel (notes/actions/audit sit in their own sub-routes). */
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

  const { data: report, error } = await supabase
    .from("user_reports")
    .select("*")
    .eq("id", parsedParams.data.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to load report." }, { status: 500 });
  }
  if (!report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  return NextResponse.json({ report });
}

/** PATCH /api/admin/reports/:id — updates status (Open/Under Review/
 * Resolved/Rejected), assigned moderator, priority, and/or category.
 * Every change appends a summary line to report_audit_log so
 * Administration → Audit Log always reflects who changed what and when. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const parsed = updateReportSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { data: before, error: beforeError } = await supabase
    .from("user_reports")
    .select("status, assigned_moderator_id, priority, category_key")
    .eq("id", parsedParams.data.id)
    .maybeSingle();
  if (beforeError || !before) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const isResolving = parsed.data.status === "resolved" || parsed.data.status === "dismissed";

  const update: Record<string, unknown> = {};
  if (parsed.data.status !== undefined) {
    update.status = parsed.data.status;
    update.resolved_by = isResolving ? user.id : null;
    update.resolved_at = isResolving ? new Date().toISOString() : null;
  }
  if (parsed.data.assignedModeratorId !== undefined) update.assigned_moderator_id = parsed.data.assignedModeratorId;
  if (parsed.data.priority !== undefined) update.priority = parsed.data.priority;
  if (parsed.data.categoryKey !== undefined) update.category_key = parsed.data.categoryKey;

  const { data: updated, error } = await supabase
    .from("user_reports")
    .update(update)
    .eq("id", parsedParams.data.id)
    .select()
    .single();

  if (error) {
    return apiError(error);
  }

  const auditEntries: { action: string; details: Record<string, unknown> }[] = [];
  if (parsed.data.status !== undefined && parsed.data.status !== before.status) {
    auditEntries.push({
      action: "status_changed",
      details: { from: STATUS_LABELS[before.status] ?? before.status, to: STATUS_LABELS[parsed.data.status] },
    });
  }
  if (parsed.data.assignedModeratorId !== undefined && parsed.data.assignedModeratorId !== before.assigned_moderator_id) {
    auditEntries.push({
      action: "assignee_changed",
      details: { moderatorId: parsed.data.assignedModeratorId },
    });
  }
  if (parsed.data.priority !== undefined && parsed.data.priority !== before.priority) {
    auditEntries.push({ action: "priority_changed", details: { from: before.priority, to: parsed.data.priority } });
  }
  if (parsed.data.categoryKey !== undefined && parsed.data.categoryKey !== before.category_key) {
    auditEntries.push({ action: "category_changed", details: { from: before.category_key, to: parsed.data.categoryKey } });
  }

  if (auditEntries.length > 0) {
    await supabase
      .from("report_audit_log")
      .insert(auditEntries.map((e) => ({ report_id: parsedParams.data.id, actor_id: user.id, ...e })));
  }

  return NextResponse.json({ report: updated });
}
