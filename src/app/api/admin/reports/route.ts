import { NextResponse, type NextRequest } from "next/server";
import { requirePermission } from "@/lib/supabase/route-auth";
import { listReportsAdminQuerySchema, createReportAdminSchema, firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";

const PAGE_SIZE = 30;

/** GET /api/admin/reports?page=&status=&kind=&reason=&categoryKey=&assignedTo=&q=
 * — the single query every Reports & Moderation screen (User Reports,
 * Report Queue, Report History, Abuse & Moderation's per-reason views,
 * Copyright/DMCA/Counter-Notices) is a filtered call to. requirePermission
 * below only gates "is this caller staff with at least one reports-ish
 * permission"; the actual per-row visibility is enforced by RLS (migration
 * 0015), so a moderator with only manage_reports transparently gets zero
 * copyright rows back on a mixed-kind query rather than a 403. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission("manage_reports").then(async (r) =>
    r.ok ? r : requirePermission("manage_copyright")
  );
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const parsed = listReportsAdminQuerySchema.safeParse({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    status: request.nextUrl.searchParams.get("status") ?? undefined,
    kind: request.nextUrl.searchParams.get("kind") ?? undefined,
    reason: request.nextUrl.searchParams.get("reason") ?? undefined,
    categoryKey: request.nextUrl.searchParams.get("categoryKey") ?? undefined,
    assignedTo: request.nextUrl.searchParams.get("assignedTo") ?? undefined,
    q: request.nextUrl.searchParams.get("q") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const { page, status, kind, reason, categoryKey, assignedTo, q } = parsed.data;

  let query = supabase
    .from("user_reports")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (status === "open") query = query.in("status", ["pending", "reviewed"]);
  else if (status === "closed") query = query.in("status", ["resolved", "dismissed"]);
  else if (status !== "all") query = query.eq("status", status);
  if (kind === "copyright_all") query = query.in("kind", ["copyright", "dmca", "counter_notice"]);
  else if (kind !== "all") query = query.eq("kind", kind);
  if (reason) query = query.eq("reason", reason);
  if (categoryKey) query = query.eq("category_key", categoryKey);
  if (assignedTo === "unassigned") query = query.is("assigned_moderator_id", null);
  else if (assignedTo) query = query.eq("assigned_moderator_id", assignedTo);
  if (q) {
    // .or() uses commas to separate conditions and % as the ILIKE
    // wildcard — strip both from user input so a search can't break out
    // of the filter string (mirrors src/app/api/admin/comments GET).
    const safeQ = q.replace(/[,%]/g, "").trim();
    if (safeQ) {
      query = query.or(
        `details.ilike.%${safeQ}%,claimant_name.ilike.%${safeQ}%,claimant_email.ilike.%${safeQ}%,infringing_url.ilike.%${safeQ}%`
      );
    }
  }

  const from = (page - 1) * PAGE_SIZE;
  const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1);

  if (error) {
    return NextResponse.json({ error: "Failed to load reports." }, { status: 500 });
  }

  const reports = data ?? [];
  const userIds = [
    ...new Set(
      reports.flatMap((r) => [r.reporter_id, r.reported_user_id, r.assigned_moderator_id]).filter(Boolean)
    ),
  ];

  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id, name").in("id", userIds)
    : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name]));

  const enriched = reports.map((r) => ({
    ...r,
    reporter_name: r.reporter_id ? nameById.get(r.reporter_id) ?? "Deleted user" : r.claimant_name || "Anonymous",
    reported_user_name: r.reported_user_id ? nameById.get(r.reported_user_id) ?? "Deleted user" : null,
    assigned_moderator_name: r.assigned_moderator_id ? nameById.get(r.assigned_moderator_id) ?? "Unknown" : null,
  }));

  return NextResponse.json({ reports: enriched, total: count ?? 0, page, pageSize: PAGE_SIZE });
}

/** POST /api/admin/reports — lets staff manually log a case that came in
 * outside the app (a phone call, an email to legal@, a claim spotted in
 * the wild) instead of forcing everything through the public-facing
 * /api/reports and /api/copyright-requests endpoints. Same permission
 * split as GET: manage_reports for kind='user', manage_copyright for
 * copyright/dmca/counter_notice. */
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = createReportAdminSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const permission = parsed.data.kind === "user" ? "manage_reports" : "manage_copyright";
  const auth = await requirePermission(permission);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const { data: inserted, error } = await supabase
    .from("user_reports")
    .insert({
      kind: parsed.data.kind,
      reporter_id: null,
      reported_user_id: parsed.data.reportedUserId ?? null,
      reason: parsed.data.kind === "user" ? parsed.data.reason : null,
      details: parsed.data.details,
      context_game_slug: parsed.data.contextGameSlug ?? null,
      context_comment_id: parsed.data.contextCommentId ?? null,
      category_key:
        parsed.data.categoryKey ?? (parsed.data.kind === "user" ? parsed.data.reason ?? null : parsed.data.kind),
      priority: parsed.data.priority,
      claimant_name: parsed.data.claimantName ?? null,
      claimant_email: parsed.data.claimantEmail ?? null,
      copyrighted_work_description: parsed.data.copyrightedWorkDescription ?? null,
      infringing_url: parsed.data.infringingUrl ?? null,
      sworn_statement: parsed.data.swornStatement,
      related_report_id: parsed.data.relatedReportId ?? null,
    })
    .select()
    .single();

  if (error) {
    return apiError(error);
  }

  await supabase.from("report_audit_log").insert({
    report_id: inserted.id,
    actor_id: user.id,
    action: "case_logged",
    details: { kind: parsed.data.kind, source: "admin" },
  });

  return NextResponse.json({ report: inserted }, { status: 201 });
}
