import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import {
  mobileHomepageSectionCreateSchema,
  firstIssueMessage,
} from "@/lib/validation";
import { invalidateMobileHomepageFragments } from "@/lib/fragment-cache-invalidation";
import { apiError } from "@/lib/api-error";

/**
 * GET  /api/admin/mobile-homepage   — list all sections (admin, all enabled states)
 * POST /api/admin/mobile-homepage   — create a new section
 */

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from("mobile_homepage_sections")
    .select("*")
    .order("position", { ascending: true });

  if (error) return apiError(error);
  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { supabase } = auth.ctx;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = mobileHomepageSectionCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("mobile_homepage_sections")
    .insert(parsed.data)
    .select()
    .single();

  if (error) {
    // Unique constraint on section_key
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A section with this category/key already exists." },
        { status: 409 }
      );
    }
    return apiError(error);
  }

  invalidateMobileHomepageFragments();
  return NextResponse.json({ section: data }, { status: 201 });
}
