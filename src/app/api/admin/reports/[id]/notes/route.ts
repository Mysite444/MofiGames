import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/supabase/route-auth";
import { createReportNoteSchema, firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";

const paramsSchema = z.object({ id: z.string().uuid() });

/** GET /api/admin/reports/:id/notes — Administration → Moderator Notes.
 * Internal-only, newest first. */
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
    .from("report_notes")
    .select("*")
    .eq("report_id", parsedParams.data.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load notes." }, { status: 500 });
  }

  const moderatorIds = [...new Set((data ?? []).map((n) => n.moderator_id).filter(Boolean))];
  const { data: profiles } = moderatorIds.length
    ? await supabase.from("profiles").select("id, name").in("id", moderatorIds)
    : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name]));

  const notes = (data ?? []).map((n) => ({ ...n, moderator_name: nameById.get(n.moderator_id) ?? "Unknown" }));

  return NextResponse.json({ notes });
}

/** POST /api/admin/reports/:id/notes — adds an internal note and logs it
 * to the audit trail. */
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

  const parsed = createReportNoteSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { data: note, error } = await supabase
    .from("report_notes")
    .insert({ report_id: parsedParams.data.id, moderator_id: user.id, note: parsed.data.note })
    .select()
    .single();

  if (error) {
    return apiError(error);
  }

  await supabase.from("report_audit_log").insert({
    report_id: parsedParams.data.id,
    actor_id: user.id,
    action: "note_added",
    details: { noteId: note.id },
  });

  return NextResponse.json({ note }, { status: 201 });
}
