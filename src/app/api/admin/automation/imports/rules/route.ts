import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { importRuleUpsertSchema, firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";

/** POST /api/admin/automation/imports/rules — create or replace the
 * Import Rules for a provider (auto-publish, category/tag defaults,
 * duplicate handling, per-run limits). One rule set per provider —
 * upserts on the unique provider_id constraint. */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = importRuleUpsertSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("import_rules")
    .upsert(parsed.data, { onConflict: "provider_id" })
    .select()
    .single();

  if (error) {
    return apiError(error);
  }

  return NextResponse.json({ rule: data });
}
