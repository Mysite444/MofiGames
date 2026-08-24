import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { createApiKeySchema, firstIssueMessage } from "@/lib/validation";
import { generateApiKey } from "@/lib/api-keys";
import { logAdminAction } from "@/lib/supabase/admin-action-log";

/** GET /api/admin/api-keys — Admin → Security → API Keys. Never returns
 * key_hash — the masked key_prefix is all the list needs. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from("api_keys")
    .select("id, label, key_prefix, scopes, rate_limit_per_hour, created_at, last_used_at, expires_at, revoked_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load API keys." }, { status: 500 });
  }
  return NextResponse.json({ keys: data ?? [] });
}

/** POST /api/admin/api-keys — mints a new key. The raw key is returned
 * exactly once, in this response — it's never retrievable again after
 * this. */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const parsed = createApiKeySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const { label, scopes, rateLimitPerHour, expiresInDays } = parsed.data;

  const generated = generateApiKey();
  const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000).toISOString() : null;

  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      label,
      key_prefix: generated.prefix,
      key_hash: generated.hash,
      scopes,
      rate_limit_per_hour: rateLimitPerHour,
      expires_at: expiresAt,
      created_by: user.id,
    })
    .select("id, label, key_prefix, scopes, rate_limit_per_hour, created_at, expires_at")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to create API key." }, { status: 500 });
  }

  await logAdminAction(supabase, user, {
    action: "api_key_created",
    targetType: "api_key",
    targetId: data.id,
    summary: `Created API key "${label}" (scopes: ${scopes.join(", ") || "none"}).`,
    metadata: { label, scopes, rateLimitPerHour, expiresInDays },
  });

  return NextResponse.json({ key: data, rawKey: generated.raw }, { status: 201 });
}
