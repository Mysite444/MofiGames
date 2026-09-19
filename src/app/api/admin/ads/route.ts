import { NextResponse } from "next/server";
import { requireAdmin, publicClient } from "@/lib/supabase/route-auth";
import { adSettingsUpdateSchema, firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";
import { purgeFragment } from "@/lib/fragment-cache";

/** GET /api/admin/ads — read-only, no admin gate: the public site reads
 * this singleton row directly to decide what ad units to render (header,
 * sidebar, in-game, footer, sticky, reward, custom HTML), and the admin
 * settings form needs to load before we know whether the request is from
 * an admin session anyway. PUT below is the one that's admin-gated. */
export async function GET() {
  const supabase = await publicClient();
  const { data, error } = await supabase.from("ad_settings").select("*").eq("id", true).maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "Could not load advertisement settings." }, { status: 500 });
  }
  return NextResponse.json({ settings: data });
}

/** PUT /api/admin/ads — partial update of the singleton row. Admin only. */
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

  const parsed = adSettingsUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("ad_settings")
    .update(parsed.data)
    .eq("id", true)
    .select()
    .single();

  if (error) {
    return apiError(error);
  }

  purgeFragment("ad-settings");
  return NextResponse.json({ settings: data });
}
