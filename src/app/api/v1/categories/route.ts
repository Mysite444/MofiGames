import { NextResponse, type NextRequest } from "next/server";
import { authenticateApiRequest, corsHeaders } from "@/lib/api-auth";
import { getSecuritySettingsServer } from "@/lib/security-server";
import { getAllRealCategories } from "@/lib/games-server";

/** GET /api/v1/categories — every category configured through the admin
 * panel. Requires an API key with the `read:categories` scope. */
export async function GET(request: NextRequest) {
  const auth = await authenticateApiRequest(request, "read:categories");
  if (!auth.ok) return auth.response;

  const settings = await getSecuritySettingsServer();
  const cors = corsHeaders(request, settings.apiCorsOrigins);

  const categories = await getAllRealCategories();

  return NextResponse.json(
    {
      categories: categories.map((c) => ({ slug: c.slug, name: c.name, description: c.description })),
    },
    { headers: cors }
  );
}

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
