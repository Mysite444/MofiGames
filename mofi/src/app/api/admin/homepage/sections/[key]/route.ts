import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import {
  homepageSectionKeyParamSchema,
  homepageSectionUpdateSchema,
  firstIssueMessage,
} from "@/lib/validation";
import { invalidateHomepageFragments } from "@/lib/fragment-cache-invalidation";
import { apiError } from "@/lib/api-error";

/**
 * PATCH /api/admin/homepage/sections/:key — admin only. Partial update of
 * one of the 25 registry rows (7 system-curated + 18 built-in genres) from
 * src/lib/homepage-section-registry.ts — label override, global position
 * (shared number-space with categories.homepage_position), and visibility.
 *
 * Rows are pre-seeded by migration 0030, so this is always an UPDATE, never
 * an insert — a 404 here means the :key isn't one of the known rows.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const parsedParams = homepageSectionKeyParamSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Unrecognized homepage section." }, { status: 400 });
  }

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

  const parsedBody = homepageSectionUpdateSchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: firstIssueMessage(parsedBody.error) }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("homepage_sections")
    .update(parsedBody.data)
    .eq("section_key", parsedParams.data.key)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Homepage section not found." }, { status: 404 });
    }
    return apiError(error);
  }

  invalidateHomepageFragments();
  return NextResponse.json({ section: data });
}
