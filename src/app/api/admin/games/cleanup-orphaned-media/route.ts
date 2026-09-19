import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { apiError } from "@/lib/api-error";
import { logAdminAction } from "@/lib/supabase/admin-action-log";
import { scanOrphanedGameMedia, deleteOrphanedGameMedia } from "@/lib/supabase/game-storage-cleanup";

// Cap how many sample paths each bucket returns from a scan — an admin
// previewing the cleanup needs to see *what* it's about to delete, not a
// dump of every path when there are thousands.
const SAMPLE_LIMIT = 30;

/** GET /api/admin/games/cleanup-orphaned-media — admin only. Dry-run scan
 * across game-thumbnails / game-media / game-files: reports every Storage
 * object no game row currently references, without deleting anything.
 * Meant to back an admin UI "preview" step before the destructive POST
 * below. Covers both pre-existing leaks (games deleted before storage
 * cleanup was wired up) and the ordinary drift from editing a game's
 * media (uploads are timestamped, so replacing a file doesn't remove the
 * old one — see uploadThumbnail/uploadGameMedia in admin-content.ts). */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  try {
    const scan = await scanOrphanedGameMedia(supabase);
    const buckets = Object.fromEntries(
      Object.entries(scan.buckets).map(([bucket, info]) => [
        bucket,
        {
          scanned: info.scanned,
          orphanCount: info.orphanPaths.length,
          truncated: info.truncated,
          sample: info.orphanPaths.slice(0, SAMPLE_LIMIT),
        },
      ])
    );
    return NextResponse.json({ buckets, errors: scan.errors });
  } catch (err) {
    return apiError(err, "Failed to scan for orphaned media.");
  }
}

/** POST /api/admin/games/cleanup-orphaned-media — admin only. Re-scans
 * (never trusts a client-held preview — see deleteOrphanedGameMedia's
 * docstring) and deletes every orphaned object found. Best-effort per
 * bucket: a failure in one bucket doesn't stop the others from being
 * attempted; per-bucket errors come back in the response and are also
 * written into the admin action log for follow-up. */
export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  try {
    const result = await deleteOrphanedGameMedia(supabase);
    const totalDeleted = Object.values(result.deletedCounts).reduce((a, b) => a + b, 0);

    await logAdminAction(supabase, user, {
      action: "storage_orphan_cleanup",
      targetType: "storage",
      summary: `Removed ${totalDeleted} orphaned game media file${totalDeleted === 1 ? "" : "s"}.`,
      metadata: { deletedCounts: result.deletedCounts, truncated: result.truncated, errors: result.errors },
    });

    if (result.errors.length > 0) {
      console.error("[games:cleanup-orphaned-media] completed with errors:", result.errors);
    }

    return NextResponse.json({
      deletedCounts: result.deletedCounts,
      totalDeleted,
      truncated: result.truncated,
      errors: result.errors,
    });
  } catch (err) {
    return apiError(err, "Failed to clean up orphaned media.");
  }
}
