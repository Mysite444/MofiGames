import { NextResponse, type NextRequest } from "next/server";
import { publicClient } from "@/lib/supabase/route-auth";
import { fileCopyrightClaimSchema, firstIssueMessage } from "@/lib/validation";
import { clientIp } from "@/lib/request-ip";

/** POST /api/copyright-requests — public submission for a copyright claim,
 * DMCA takedown notice, or DMCA counter-notice. No account required (a
 * rights holder or an accused user may not have one).
 *
 * M-1 fix (2026-09 security audit): the previous implementation called
 * supabase.from("user_reports").insert() directly.  The matching RLS policy
 * ("Anyone can file a copyright claim") had `with check (true for the three
 * kinds)` and no rate limit, so an attacker bypassing this route could flood
 * the admin moderation queue with junk via direct REST API calls.
 *
 * The route now calls the file_copyright_claim() SECURITY DEFINER RPC
 * (migration 0079), which applies a per-IP cap (20/10 min) before writing
 * the row and enforces the sworn-statement rule at the database layer too.
 * The open direct-insert policy has been dropped. */
export async function POST(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = fileCopyrightClaimSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  if (parsed.data.kind !== "counter_notice" && !parsed.data.swornStatement) {
    return NextResponse.json(
      { error: "You must certify this statement under penalty of perjury to submit it." },
      { status: 400 }
    );
  }

  const supabase = await publicClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ip = clientIp(request);

  const { error } = await supabase.rpc("file_copyright_claim", {
    p_kind:                          parsed.data.kind,
    p_reporter_id:                   user?.id ?? null,
    p_details:                       parsed.data.details,
    p_claimant_name:                 parsed.data.claimantName,
    p_claimant_email:                parsed.data.claimantEmail,
    p_copyrighted_work_description:  parsed.data.copyrightedWorkDescription,
    p_infringing_url:                parsed.data.infringingUrl ?? null,
    p_sworn_statement:               parsed.data.swornStatement ?? false,
    p_related_report_id:             parsed.data.relatedReportId ?? null,
    p_ip:                            ip ?? null,
  });

  if (error) {
    // The RPC raises a specific exception text for rate-limit hits.
    if (error.message.includes("rate limit exceeded")) {
      return NextResponse.json(
        { error: "Too many submissions from this address. Please try again later." },
        { status: 429 }
      );
    }
    return NextResponse.json({ error: "Failed to submit your request." }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
