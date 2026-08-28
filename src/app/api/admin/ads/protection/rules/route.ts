import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { adProtectionRuleInputSchema, firstIssueMessage } from "@/lib/validation";

/** GET /api/admin/ads/protection/rules — Admin → Ad Protection →
 * Whitelist / Blacklist. Every IP/visitor rule, manual or auto-created
 * (see record_ad_event() in migration 0024). */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from("ad_protection_rules")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "Failed to load whitelist/blacklist rules." }, { status: 500 });
  }
  return NextResponse.json({ rules: data ?? [] });
}

/** POST /api/admin/ads/protection/rules — manually add an IP or visitor
 * to the whitelist or blacklist. */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const parsed = adProtectionRuleInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("ad_protection_rules")
    .insert({
      target_type: parsed.data.targetType,
      mode: parsed.data.mode,
      value: parsed.data.value,
      reason: parsed.data.reason ?? null,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error) {
    const message =
      error.code === "23505" ? "That IP/visitor already has a rule — remove it first to change it." : "Failed to create rule.";
    return NextResponse.json({ error: message }, { status: error.code === "23505" ? 409 : 500 });
  }

  return NextResponse.json({ rule: data }, { status: 201 });
}
