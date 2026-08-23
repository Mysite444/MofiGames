import { NextResponse, type NextRequest } from "next/server";
import { del } from "@vercel/blob";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { apiError } from "@/lib/api-error";

// POST /api/admin/blob/delete — admin only. Deletes one or more objects
// from Vercel Blob storage.
//
// Deletion needs BLOB_READ_WRITE_TOKEN, which (unlike the upload flow)
// has no scoped-token equivalent for the browser to hold directly, so
// every delete goes through this route rather than straight from the
// client. Called from src/lib/supabase/admin-content.ts: as best-effort
// cleanup of a replaced file's previous version (uploadThumbnail /
// uploadGameMedia), and as the actual delete for deleteMediaAsset.
//
// Paths are trusted admin input the same way the old direct-to-Supabase
// `.remove()` calls were — requireAdmin() is the access boundary, not
// path validation. A caller can only ever remove what it already had a
// public blob URL/pathname for.
const MAX_PATHS_PER_REQUEST = 200;

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  let paths: unknown;
  try {
    const json = await request.json();
    paths = json?.paths;
  } catch {
    return apiError(new Error("Malformed request body"), "Invalid request.", 400);
  }

  if (!Array.isArray(paths) || paths.length === 0 || !paths.every((p) => typeof p === "string" && p.length > 0)) {
    return apiError(new Error("paths must be a non-empty string array"), "Nothing to delete.", 400);
  }
  if (paths.length > MAX_PATHS_PER_REQUEST) {
    return apiError(new Error("Too many paths"), `Can't delete more than ${MAX_PATHS_PER_REQUEST} files at once.`, 400);
  }

  try {
    await del(paths as string[]);
    return NextResponse.json({ deleted: paths.length });
  } catch (err) {
    return apiError(err, "Failed to delete file(s) from storage.");
  }
}
