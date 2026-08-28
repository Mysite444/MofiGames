import { NextResponse } from "next/server";
import { publicClient } from "@/lib/supabase/route-auth";

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  thumbnailUrl: string | null;
  createdAt: string;
}

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  thumbnail_url: string | null;
  created_at: string;
}

const PAGE_SIZE = 20;

/** GET /api/notifications — the latest site-wide notifications (e.g. "new
 * game added"), newest first. Public: no auth required, same as comments.
 * Rows are only ever written server-side (see POST /api/admin/games),
 * never through this route. */
export async function GET() {
  const supabase = await publicClient();

  const { data: rows, error } = await supabase
    .from("notifications")
    .select("id, type, title, message, link, thumbnail_url, created_at")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (error) {
    // Logged server-side only — the client just gets a generic message.
    // If this logs something like `relation "public.notifications" does
    // not exist`, the `notifications` table migration hasn't been run
    // yet: supabase/migrations/0027_notifications.sql needs to be applied
    // in the Supabase project (Dashboard → SQL Editor, or `supabase db
    // push`) before this route can succeed.
    console.error("GET /api/notifications — Supabase error:", error.message);
    return NextResponse.json({ error: "Failed to load notifications." }, { status: 500 });
  }

  const notifications: NotificationDto[] = ((rows ?? []) as NotificationRow[]).map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    link: row.link,
    thumbnailUrl: row.thumbnail_url,
    createdAt: row.created_at,
  }));

  return NextResponse.json({ notifications });
}
