import { NextResponse } from "next/server";
import { publicClient } from "@/lib/supabase/route-auth";
import { recordPageViewSchema, firstIssueMessage } from "@/lib/validation";
import { parseUserAgent } from "@/lib/user-agent";

/** POST /api/analytics/pageview — logs one page view. Called by
 * AnalyticsTracker on every route change, signed in or not. Fails soft on
 * the client (see that component) — this route just does the write and
 * always returns quickly; a dropped pageview is not worth surfacing an
 * error for. Device/browser/OS are parsed from the request's own
 * User-Agent header server-side rather than trusted from the client body,
 * since that's the one thing here that can't be spoofed as easily. */
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = recordPageViewSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const supabase = await publicClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { deviceType, browser, os } = parseUserAgent(request.headers.get("user-agent"));

  const { error } = await supabase.from("page_views").insert({
    path: parsed.data.path,
    referrer: parsed.data.referrer || null,
    visitor_id: parsed.data.visitorId,
    user_id: user?.id ?? null,
    device_type: deviceType,
    browser,
    os,
  });

  if (error) {
    return NextResponse.json({ error: "Failed to record page view." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
