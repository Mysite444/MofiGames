import { NextResponse, type NextRequest } from "next/server";
import { publicClient, requireAdmin } from "@/lib/supabase/route-auth";
import { dnsPrefetchSettingsInputSchema } from "@/lib/validation-dns-cache";
import { purgeFragment } from "@/lib/fragment-cache";

/** GET /api/dns-prefetch/settings — the dns_prefetch_settings row.
 * Deliberately unauthenticated: the admin UI's live preview needs it,
 * and it exists at all so anonymous, first-visit page loads can pick up
 * the current domain list without needing a signed-in session — the
 * same reasoning as /api/cache/settings (Browser Cache). The root
 * layout itself doesn't call this route (a relative fetch() URL has no
 * base outside a browser) — it reads the table directly via
 * getDnsPrefetchSettingsServer(). This endpoint is for client-side
 * callers only. */
export async function GET() {
  const supabase = await publicClient();
  const { data } = await supabase.from("dns_prefetch_settings").select("*").eq("id", true).maybeSingle();
  return NextResponse.json({ settings: data ?? null });
}

/** PUT /api/dns-prefetch/settings — Admin → Cache → DNS Cache → Browser
 * DNS Cache. Admin-only. */
export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = dnsPrefetchSettingsInputSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return NextResponse.json({ error: firstIssue?.message ?? "Validation error." }, { status: 422 });
  }
  const input = parsed.data;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: user.id };
  if (input.dnsPrefetchControlEnabled !== undefined) patch.dns_prefetch_control_enabled = input.dnsPrefetchControlEnabled;
  if (input.dnsPrefetchDomains !== undefined) patch.dns_prefetch_domains = input.dnsPrefetchDomains;
  if (input.preconnectDomains !== undefined) patch.preconnect_domains = input.preconnectDomains;

  const { data, error } = await supabase
    .from("dns_prefetch_settings")
    .update(patch)
    .eq("id", true)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update DNS prefetch settings." }, { status: 500 });
  }

  // Purges the layout's <link rel="dns-prefetch"> fragment (full domain
  // list — see getDnsPrefetchSettingsServer) immediately. This does NOT
  // reach middleware.ts's separate, request-header-only cache of this
  // same table (different runtime/global scope — no shared memory
  // between middleware and Server Components); that one self-expires
  // within its own 30s TTL, an intentional, documented trade-off (see
  // SETTINGS_CACHE_TTL_MS in middleware.ts).
  purgeFragment("dns-prefetch-hints");
  return NextResponse.json({ settings: data });
}
