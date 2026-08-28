import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { menuLinkInputSchema, firstIssueMessage } from "@/lib/validation";
import { invalidateNavigationFragments } from "@/lib/fragment-cache-invalidation";
import { apiError } from "@/lib/api-error";

/** POST /api/admin/menu-links — create a custom nav link. Admin only.
 * (Reading the list is done client-side straight from the `menu_links`
 * table — see fetchAllMenuLinksAdmin in admin-content.ts — same pattern
 * as Pages.) */
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

  const parsed = menuLinkInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { data, error } = await supabase.from("menu_links").insert(parsed.data).select().single();

  if (error) {
    return apiError(error);
  }

  invalidateNavigationFragments();
  return NextResponse.json({ link: data }, { status: 201 });
}
