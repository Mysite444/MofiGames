import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/route-auth";
import { updateProfileSchema, firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";

/** PATCH /api/account/profile — updates the signed-in user's display name
 * and/or bio. Both are length-capped and sanitized server-side
 * (src/lib/validation.ts's updateProfileSchema, src/lib/sanitize-text.ts)
 * before anything is written.
 *
 * This route is new as of the XSS-hardening pass — previously
 * AuthContext.updateProfile() wrote `name` straight from the browser to
 * `auth.updateUser()` and the `profiles` table with no server-side
 * validation at all (RLS only guarantees a user can exclusively write
 * their *own* row, not that what they write is well-formed). Now both the
 * profile page and the account-settings inline editor go through this
 * one validated, sanitized path. */
export async function PATCH(request: Request) {
  const auth = await requireUser();
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

  const parsed = updateProfileSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const { name, bio } = parsed.data;

  // Keep the auth user_metadata name in sync too — comments fall back to
  // it if the profiles row lookup ever misses (see
  // src/app/api/comments/route.ts).
  if (name !== undefined) {
    const { error: authError } = await supabase.auth.updateUser({ data: { name } });
    if (authError) {
      return apiError(authError, "Failed to update profile.");
    }
  }

  const patch: Record<string, string> = {};
  if (name !== undefined) patch.name = name;
  if (bio !== undefined) patch.bio = bio;

  const { error: profileError } = await supabase.from("profiles").update(patch).eq("id", user.id);
  if (profileError) {
    return apiError(profileError, "Failed to update profile.");
  }

  return NextResponse.json({ ok: true, name, bio });
}
