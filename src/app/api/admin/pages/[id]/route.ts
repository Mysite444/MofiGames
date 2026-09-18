import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-config";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { pageUpdateSchema, firstIssueMessage } from "@/lib/validation";
import { invalidateNavigationFragments } from "@/lib/fragment-cache-invalidation";
import { apiError } from "@/lib/api-error";
import { logAdminAction } from "@/lib/supabase/admin-action-log";

const paramsSchema = z.object({ id: z.string().uuid() });

/** PATCH /api/admin/pages/:id — admin only. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid page id." }, { status: 400 });
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

  const parsedBody = pageUpdateSchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: firstIssueMessage(parsedBody.error) }, { status: 400 });
  }
  if (Object.keys(parsedBody.data).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("pages")
    .update(parsedBody.data)
    .eq("id", parsedParams.data.id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A page with that slug already exists." }, { status: 409 });
    }
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Page not found." }, { status: 404 });
    }
    return apiError(error);
  }

  invalidateNavigationFragments();
  // Bust the ISR cache for this CMS page so admin edits are immediately
  // visible. Pages are addressed by slug in the [slug] catch-all route.
  // Known static-slug pages (about, contact, terms…) also have their own
  // dedicated routes under /src/app/<slug>/page.tsx — revalidate both the
  // [slug] catch-all path AND the dedicated path so whichever is serving
  // the request gets the fresh content.
  revalidatePath(`/${data.slug}`);
  // Well-known dedicated routes that mirror CMS-editable page slugs:
  const dedicatedRoutes: Record<string, string> = {
    about: "/about",
    contact: "/contact",
    terms: "/terms",
    "privacy-policy": "/privacy-policy",
    disclaimer: "/disclaimer",
    "kids-message": "/kids-message",
    "parents-info": "/parents-info",
  };
  if (dedicatedRoutes[data.slug]) revalidatePath(dedicatedRoutes[data.slug]);
  revalidateTag(CACHE_TAGS.PAGES, { expire: 0 });
  revalidateTag(CACHE_TAGS.page(data.slug), { expire: 0 });
  return NextResponse.json({ page: data });
}

/** DELETE /api/admin/pages/:id — admin only. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid page id." }, { status: 400 });
  }

  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const { data: existing } = await supabase
    .from("pages")
    .select("title, slug")
    .eq("id", parsedParams.data.id)
    .maybeSingle();

  const { error } = await supabase.from("pages").delete().eq("id", parsedParams.data.id);
  if (error) {
    return apiError(error);
  }

  await logAdminAction(supabase, user, {
    action: "page_deleted",
    targetType: "page",
    targetId: parsedParams.data.id,
    summary: existing ? `Deleted page "${existing.title}" (${existing.slug}).` : "Deleted a page.",
    metadata: existing ?? {},
  });

  invalidateNavigationFragments();
  if (existing?.slug) revalidatePath(`/${existing.slug}`);
  if (existing?.slug) {
    revalidateTag(CACHE_TAGS.PAGES, { expire: 0 });
    revalidateTag(CACHE_TAGS.page(existing.slug), { expire: 0 });
  }
  return NextResponse.json({ ok: true });
}
