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
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

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

  // Always append new sections after the current last one. The "Add
  // Section" form has no position field, and mobileHomepageSectionCreateSchema
  // defaults a missing `position` to 0 — so every section created from the
  // admin UI used to land at position 0. Once two or more rows share
  // position 0, `ORDER BY position` (used by both this list and the public
  // mobile homepage read in mobile-homepage-server.ts) has no deterministic
  // tiebreaker, so which section rendered where — and whether a newly added
  // section showed up at all in a given request — became unpredictable.
  // Computing the true next slot here (ignoring whatever position, if any,
  // the client sent) fixes it for every section added from now on.
  const { data: last, error: lastError } = await supabase
    .from("mobile_homepage_sections")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastError) return apiError(lastError);

  const nextPosition = (last?.position ?? 0) + 10;

  const { data, error } = await supabase
    .from("mobile_homepage_sections")
    .insert({ ...parsed.data, position: nextPosition })
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
