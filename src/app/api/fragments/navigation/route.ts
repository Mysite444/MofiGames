import { NextResponse } from "next/server";
import { publicClient } from "@/lib/supabase/route-auth";
import { getOrSetFragment } from "@/lib/fragment-cache";
import { isNextControlFlowError } from "@/lib/supabase/timeout-fetch";

/** GET /api/fragments/navigation
 * Public, unauthenticated — both tables read here (`pages`, `menu_links`)
 * are publicly readable via RLS. Backs the "navigation-menus" fragment
 * (Admin → Cache → Fragment Cache): NavList.tsx used to call Supabase
 * directly from the browser for these two reads on every mount; routing
 * them through this cached endpoint instead means a burst of visitors
 * hitting the site at once shares one cached response instead of each
 * issuing its own Supabase query.
 *
 * On a Supabase outage with nothing warm in the fragment cache (a cold
 * start during the outage), getOrSetFragment's compute() below would
 * otherwise throw straight through this handler as an uncaught
 * exception — which Next.js turns into a 500 response. NavList.tsx's
 * fetch already tolerates that (see useNavigationFragment's own
 * try/catch, which falls back to empty lists either way), but there's
 * no reason to actually 500: returning 200 with empty lists is both the
 * correct steady-state answer during an outage and much quieter in
 * uptime/error monitoring than a stream of real-looking 500s. */
export async function GET() {
  try {
    const data = await getOrSetFragment("navigation-menus", "sidebar", async () => {
      const supabase = await publicClient();

      const [{ data: pages }, { data: menuLinks }] = await Promise.all([
        supabase
          .from("pages")
          .select("slug, title")
          .eq("is_published", true)
          .eq("show_in_nav", true)
          .order("sort_order", { ascending: true }),
        supabase
          .from("menu_links")
          .select("id, label, url, open_in_new_tab")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
      ]);

      return {
        pages: pages ?? [],
        menuLinks: menuLinks ?? [],
      };
    });

    return NextResponse.json(data);
  } catch (err) {
    if (isNextControlFlowError(err)) throw err;
    console.error("[api/fragments/navigation] Live read failed, returning empty nav extras:", err);
    return NextResponse.json({ pages: [], menuLinks: [] });
  }
}
