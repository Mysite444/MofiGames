import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { createAccessRuleSchema, firstIssueMessage } from "@/lib/validation";
import { logAdminAction } from "@/lib/supabase/admin-action-log";

/** GET /api/admin/security/access-rules — Admin → Security → Access
 * Control. Every IP/country allow/block rule, enforced in middleware
 * (check_access(), migration 0018). */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data, error } = await supabase.from("access_rules").select("*").order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "Failed to load access rules." }, { status: 500 });
  }
  return NextResponse.json({ rules: data ?? [] });
}

/** POST /api/admin/security/access-rules — add an IP or country
 * allow/block rule. */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const parsed = createAccessRuleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("access_rules")
    .insert({
      rule_type: parsed.data.ruleType,
      mode: parsed.data.mode,
      value: parsed.data.value,
      reason: parsed.data.reason ?? null,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error) {
    const message = error.code === "23505" ? "That rule already exists." : "Failed to create access rule.";
    return NextResponse.json({ error: message }, { status: error.code === "23505" ? 409 : 500 });
  }

  await logAdminAction(supabase, user, {
    action: "access_rule_created",
    targetType: "access_rule",
    targetId: data.id,
    summary: `${parsed.data.mode === "block" ? "Blocked" : "Allowed"} ${parsed.data.ruleType} "${parsed.data.value}".`,
    metadata: { ruleType: parsed.data.ruleType, mode: parsed.data.mode, value: parsed.data.value },
  });

  return NextResponse.json({ rule: data }, { status: 201 });
}
