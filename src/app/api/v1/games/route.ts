import { NextResponse, type NextRequest } from "next/server";
import { authenticateApiRequest, corsHeaders } from "@/lib/api-auth";
import { getSecuritySettingsServer } from "@/lib/security-server";
import { getAllRealGames, getRealGamesByCategory } from "@/lib/games-server";
import { listGamesV1QuerySchema } from "@/lib/validation";
import { REVALIDATE } from "@/lib/cache-config";

/** GET /api/v1/games — published, publicly-visible games. Requires an
 * API key with the `read:games` scope (Admin → Security → API Keys).
 * See src/lib/api-auth.ts for the auth/rate-limit/CORS handling shared
 * across every /api/v1/* route.
 *
 * CACHING: The underlying game data is public and identical for every
 * valid API key. However, the Authorization header and CORS vary per
 * caller so this route cannot use export const revalidate (which would
 * cache the response including those headers).  Instead we emit
 * Cache-Control: private, stale-while-revalidate so each API client
 * caches its own copy locally for REVALIDATE.GAME seconds. */
export async function GET(request: NextRequest) {
  const auth = await authenticateApiRequest(request, "read:games");
  if (!auth.ok) return auth.response;

  const settings = await getSecuritySettingsServer();
  const cors = corsHeaders(request, settings.apiCorsOrigins);

  const parsed = listGamesV1QuerySchema.safeParse({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    pageSize: request.nextUrl.searchParams.get("pageSize") ?? undefined,
    category: request.nextUrl.searchParams.get("category") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters." }, { status: 400, headers: cors });
  }
  const { page, pageSize, category } = parsed.data;

  const allGames = category ? await getRealGamesByCategory(category) : await getAllRealGames();
  const start = (page - 1) * pageSize;
  const pageItems = allGames.slice(start, start + pageSize);

  return NextResponse.json(
    {
      games: pageItems.map((g) => ({
        slug: g.slug,
        title: g.title,
        category: g.categorySlug,
        rating: g.rating,
        plays: g.plays,
        multiplayer: g.multiplayer,
        thumbnailUrl: g.thumbnailUrl ?? null,
      })),
      page,
      pageSize,
      total: allGames.length,
    },
    {
      headers: {
        ...cors,
        // private = only the requesting client may cache (no shared CDN cache
        // because Authorization header makes every request distinct at the CDN).
        // stale-while-revalidate lets the client serve the stale list while
        // fetching a fresh copy in the background — zero perceived latency on
        // repeat calls within the grace window.
        "Cache-Control": `private, max-age=${REVALIDATE.GAME}, stale-while-revalidate=${REVALIDATE.GAME * 2}`,
      },
    }
  );
}

/** CORS preflight — see corsHeaders() in src/lib/api-auth.ts. Runs
 * before any Authorization header is available (browsers never send
 * custom headers on an OPTIONS preflight), so this can only decide the
 * origin question, not authenticate — that happens on the real request. */
export async function OPTIONS(request: NextRequest) {
  const settings = await getSecuritySettingsServer();
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...corsHeaders(request, settings.apiCorsOrigins),
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  });
}
