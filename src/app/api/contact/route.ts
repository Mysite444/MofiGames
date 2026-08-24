import { NextResponse, type NextRequest } from "next/server";
import { contactFormSchema, firstIssueMessage } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { publicClient } from "@/lib/supabase/route-auth";
import { getServiceRoleClient } from "@/lib/supabase/admin-client";

/**
 * POST /api/contact — public endpoint for the /contact page form.
 *
 * Security layers applied, in order:
 *
 *  1. JSON parsing guard — malformed bodies are rejected immediately.
 *  2. Honeypot check — the `website` field is hidden from real users; any
 *     value in it means an automated submission and we stop here without
 *     leaking *why* (the client sees the same "Message sent" response as a
 *     real submission to avoid training bots on the detection signal).
 *  3. Zod validation — name/email/subject/message are trimmed and
 *     length-checked against the same schema used client-side so both sides
 *     agree on what "valid" means.
 *  4. Rate limiting (two dimensions):
 *       • Per IP: 5 submissions per hour — generous for a real visitor who
 *         might try more than once, tight for a spam script.
 *       • Per email: 3 submissions per hour — stops an attacker from
 *         rotating IPs but using the same email address.
 *  5. Write — the service-role client bypasses RLS so we avoid having to
 *     expose an INSERT policy to anon.  All trusted input comes from the
 *     validated `parsed.data` object, never directly from the raw body.
 *
 * The CSRF same-origin check in middleware.ts applies automatically to this
 * POST because it's under /api/*.
 */
export async function POST(request: NextRequest) {
  // 1. Parse body
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // 2 + 3. Honeypot + schema validation
  const parsed = contactFormSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  // 2b. Honeypot in the valid-parse result (schema coerces it to "" so a
  //     non-empty value can only arrive from a bot that ignores the hidden attr)
  if (parsed.data.website && parsed.data.website.length > 0) {
    // Silently succeed — no free signal about the detection method.
    return NextResponse.json({ ok: true });
  }

  const { name, email, subject, message } = parsed.data;
  const ip = clientIp(request);
  const userAgent = request.headers.get("user-agent") ?? null;

  // 4. Rate limiting
  const supabase = await publicClient();

  if (ip) {
    const underIpLimit = await checkRateLimit(supabase, `contact-ip:${ip}`, 3600, 5);
    if (!underIpLimit) {
      return NextResponse.json(
        { error: "Too many messages from your connection. Try again later." },
        { status: 429 }
      );
    }
  }

  const underEmailLimit = await checkRateLimit(
    supabase,
    `contact-email:${email.toLowerCase()}`,
    3600,
    3
  );
  if (!underEmailLimit) {
    return NextResponse.json(
      { error: "Too many messages sent from this email address. Try again later." },
      { status: 429 }
    );
  }

  // Read session (optional — links the message to an account if the sender
  // is logged in, but the form works fine for anonymous visitors too).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 5. Persist — use service-role client so no RLS INSERT policy is needed
  //    on contact_messages for anon.  Falls back to the anon client (which
  //    works if the SUPABASE_SERVICE_ROLE_KEY env var is not set in local dev).
  try {
    const admin = getServiceRoleClient() ?? supabase;
    const { error } = await admin.from("contact_messages").insert({
      name,
      email,
      subject,
      message,
      ip,
      user_agent: userAgent,
      user_id: user?.id ?? null,
    });
    if (error) throw error;
  } catch (err) {
    console.error("[contact] insert failed:", err);
    return NextResponse.json(
      { error: "Could not save your message. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
