import { NextResponse } from "next/server";
import { publicClient } from "@/lib/supabase/route-auth";
import { fileCopyrightClaimSchema, firstIssueMessage } from "@/lib/validation";

/** POST /api/copyright-requests — public submission for a copyright claim,
 * DMCA takedown notice, or DMCA counter-notice. No account required (a
 * rights holder or an accused user may not have one) — RLS (migration
 * 0015) only allows inserts for these three kinds, everything else on
 * user_reports still requires an authenticated reporter. Feeds straight
 * into Admin → Reports → Copyright Requests / DMCA Requests /
 * Counter-Notices, which are just this same table filtered by kind. */
export async function POST(request: Request) {
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

  const { error } = await supabase.from("user_reports").insert({
    kind: parsed.data.kind,
    reporter_id: user?.id ?? null,
    reported_user_id: null,
    reason: null,
    details: parsed.data.details,
    category_key: parsed.data.kind,
    claimant_name: parsed.data.claimantName,
    claimant_email: parsed.data.claimantEmail,
    copyrighted_work_description: parsed.data.copyrightedWorkDescription,
    infringing_url: parsed.data.infringingUrl,
    sworn_statement: parsed.data.swornStatement,
    related_report_id: parsed.data.relatedReportId ?? null,
  });

  if (error) {
    return NextResponse.json({ error: "Failed to submit your request." }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
