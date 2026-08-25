import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin, publicClient } from "@/lib/supabase/route-auth";
import { siteIdentityUpdateSchema, firstIssueMessage } from "@/lib/validation";
import { invalidateFooterFragments, invalidateSiteIdentityFragments } from "@/lib/fragment-cache-invalidation";
import { apiError } from "@/lib/api-error";
import { logAdminAction } from "@/lib/supabase/admin-action-log";

/** GET /api/admin/site-identity — read-only, no admin gate: the settings
 * form needs to load before we know whether *this* request is from an
 * admin session, and the row itself is publicly readable anyway (RLS:
 * select true) since public pages (header, favicon) read it too. PUT
 * below is the one that's admin-gated. */
export async function GET() {
  const supabase = await publicClient();
  const { data, error } = await supabase.from("site_identity").select("*").eq("id", true).maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "Could not load site identity settings." }, { status: 500 });
  }
  return NextResponse.json({ settings: data });
}

/** PUT /api/admin/site-identity — partial update of the singleton row.
 * Admin only. */
export async function PUT(request: Request) {
  const auth = await requireAdmin();
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

  const parsed = siteIdentityUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("site_identity")
    .update(parsed.data)
    .eq("id", true)
    .select()
    .single();

  if (error) {
    return apiError(error);
  }

  await logAdminAction(supabase, user, {
    action: "site_identity_updated",
    targetType: "site_identity",
    summary: `Updated site identity (${Object.keys(parsed.data).join(", ")}).`,
    metadata: parsed.data,
  });

  invalidateFooterFragments();
  invalidateSiteIdentityFragments();

  // Site Name, Favicon/App Icons, and Logo are all baked into the root
  // layout's <head> (generateMetadata reads getSiteIdentity()) on every
  // page. That HTML is cached by Next.js (ISR/static generation — see
  // next.config.ts's CSP comment) and, unlike the fragment cache above,
  // doesn't refresh on its own; it only regenerates on a redeploy or an
  // explicit revalidation. Previously the only thing that ever called
  // revalidatePath was the "Auto Cache Purge" automation job on its
  // schedule (src/lib/automation/infra-executors.ts) — which requires an
  // external scheduler to actually be hitting /api/cron/automation.
  // Without that wired up, a saved favicon/logo/site name could look like
  // it "never changes" even though the database (and the underlying
  // /favicon.ico route, which is fetched fresh) is already correct — the
  // page shell serving it was just never told to regenerate. Doing it
  // here means it takes effect the moment an admin clicks Save,
  // regardless of whether the cron job is running.
  revalidatePath("/", "layout");

  return NextResponse.json({ settings: data });
}
