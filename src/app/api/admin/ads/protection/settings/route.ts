import { NextResponse } from "next/server";
import { requireAdmin, publicClient } from "@/lib/supabase/route-auth";
import { adProtectionSettingsUpdateSchema, firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";

/** GET /api/admin/ads/protection/settings — read-only, no admin gate: the
 * public tracking route (/api/ads/track) reads this singleton row to
 * decide which detections are active before it scores an event. PUT below
 * is admin-only. */
export async function GET() {
  const supabase = await publicClient();
  const { data, error } = await supabase.from("ad_protection_settings").select("*").eq("id", true).maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "Could not load ad protection settings." }, { status: 500 });
  }
  return NextResponse.json({ settings: data });
}

/** PUT /api/admin/ads/protection/settings — partial update of the
 * singleton row. Admin only. */
export async function PUT(request: Request) {
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

  const parsed = adProtectionSettingsUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("ad_protection_settings")
    .update(parsed.data)
    .eq("id", true)
    .select()
    .single();

  if (error) {
    return apiError(error);
  }

  return NextResponse.json({ settings: data });
}
