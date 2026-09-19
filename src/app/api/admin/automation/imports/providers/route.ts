import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { importProviderInputSchema, firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";

/** GET /api/admin/automation/imports/providers — every configured game
 * import provider, with its rule (if one exists) joined in. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data: providers, error } = await supabase.from("import_providers").select("*").order("created_at", { ascending: false });
  if (error) {
    return apiError(error);
  }
  const { data: rules } = await supabase.from("import_rules").select("*");
  const ruleByProvider = new Map((rules ?? []).map((r) => [r.provider_id, r]));

  return NextResponse.json({
    providers: (providers ?? []).map((p) => ({ ...p, rule: ruleByProvider.get(p.id) ?? null })),
  });
}

/** POST /api/admin/automation/imports/providers — add a new game feed
 * provider (Import Scheduler). */
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

  const parsed = importProviderInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { data, error } = await supabase.from("import_providers").insert(parsed.data).select().single();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A provider with that slug already exists." }, { status: 409 });
    }
    return apiError(error);
  }

  return NextResponse.json({ provider: data }, { status: 201 });
}
