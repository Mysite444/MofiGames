import { NextResponse } from "next/server";
import { publicClient } from "@/lib/supabase/route-auth";
import { getOrSetFragment } from "@/lib/fragment-cache";
import { isNextControlFlowError } from "@/lib/supabase/timeout-fetch";

/** GET /api/fragments/footer
 * Public, unauthenticated — site_identity is publicly readable via RLS.
 * Backs the "footer-widgets" fragment (Admin → Cache → Fragment Cache).
 * Same reasoning as /api/fragments/navigation: NavList.tsx previously
 * queried Supabase directly from the browser for the copyright line on
 * every mount.
 *
 * Same outage handling as the navigation route above: returns a clean
 * 200 with `copyrightText: null` instead of letting an uncaught error
 * 500 — the client already falls back to the built-in copyright line
 * whenever this field is absent (see useCopyrightText in NavList.tsx). */
export async function GET() {
  try {
    const data = await getOrSetFragment("footer-widgets", "copyright", async () => {
      const supabase = await publicClient();
      const { data: identity } = await supabase
        .from("site_identity")
        .select("copyright_text")
        .eq("id", true)
        .maybeSingle();

      return { copyrightText: identity?.copyright_text ?? null };
    });

    return NextResponse.json(data);
  } catch (err) {
    if (isNextControlFlowError(err)) throw err;
    console.error("[api/fragments/footer] Live read failed, returning default copyright:", err);
    return NextResponse.json({ copyrightText: null });
  }
}
