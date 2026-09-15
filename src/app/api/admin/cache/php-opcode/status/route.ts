import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { phpOpcacheStatusActionSchema } from "@/lib/validation-php-opcode";

/**
 * POST /api/admin/cache/php-opcode/status
 * Admin-only. Executes a live OPcache action: "check" or "reset".
 *
 * Because Next.js runs in Node.js (not PHP), we cannot call
 * opcache_get_status() or opcache_reset() directly. Instead:
 *
 *   check  — calls the configured PHP status endpoint (e.g. a tiny PHP
 *             script at /opcache-status.php that returns JSON from
 *             opcache_get_status(false)), or returns an "unavailable"
 *             result if the endpoint is not configured.
 *
 *   reset  — calls the PHP reset endpoint (e.g. /opcache-reset.php) and
 *             records the timestamp in the settings row, or returns
 *             "unavailable" if the endpoint is not configured.
 *
 * PLATFORM NOTE: This panel is only applicable to deployments that run a
 * PHP application alongside or instead of the Next.js server (e.g. a
 * hybrid setup where a PHP CMS drives some routes). For Vercel/Node.js-
 * only deployments (the default MofiGames configuration), this panel has
 * no effect — there is no PHP process to configure. The route gracefully
 * returns platform_applicable: false in that case so the UI can render
 * a clear "not applicable" message instead of a confusing error.
 *
 * The PHP status/reset helper scripts are minimal one-liners that should
 * be placed outside the public document root and locked down behind
 * IP allowlisting or a shared secret header — see the README for examples.
 *
 * If OPCACHE_STATUS_URL / OPCACHE_RESET_URL env vars are not set the
 * route returns a structured "unavailable" response so the UI can display
 * a helpful setup guide rather than a raw error.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  // Fast-path for Vercel/Node.js deployments: no PHP runtime is present,
  // so OPcache actions will always be "unavailable". Surface this as a
  // first-class response rather than silently falling through to the
  // URL-not-configured path, so the admin UI can display a helpful message.
  const isVercelOrNodeOnly =
    process.env.VERCEL === "1" ||
    process.env.NEXT_RUNTIME === "nodejs" ||
    (!process.env.OPCACHE_STATUS_URL && !process.env.OPCACHE_RESET_URL);

  if (isVercelOrNodeOnly && !process.env.OPCACHE_STATUS_URL && !process.env.OPCACHE_RESET_URL) {
    return NextResponse.json({
      result: "unavailable",
      platform_applicable: false,
      message:
        "PHP OPcache is not applicable to this deployment. " +
        "MofiGames runs on Node.js/Vercel, which has no PHP runtime. " +
        "Configure OPCACHE_STATUS_URL and OPCACHE_RESET_URL only if a " +
        "PHP process is explicitly part of your infrastructure.",
      stats: null,
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = phpOpcacheStatusActionSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return NextResponse.json(
      { error: firstIssue?.message ?? "Validation error." },
      { status: 422 }
    );
  }

  const { action } = parsed.data;
  const now = new Date().toISOString();

  if (action === "check") {
    const statusUrl = process.env.OPCACHE_STATUS_URL;

    if (!statusUrl) {
      // Not configured — record as unavailable so the UI shows the setup guide.
      await supabase
        .from("php_opcode_cache_settings")
        .update({
          last_status_checked_at: now,
          last_status_result: "unavailable",
          last_status_message:
            "OPCACHE_STATUS_URL is not configured. " +
            "Add it to .env.local and deploy a PHP status helper script.",
          updated_at: now,
          updated_by: user.id,
        })
        .eq("id", true);

      return NextResponse.json({
        result: "unavailable",
        message:
          "OPCACHE_STATUS_URL is not configured. See Admin → Cache → PHP OPcache for setup instructions.",
        stats: null,
      });
    }

    try {
      const secret = process.env.OPCACHE_SECRET_HEADER ?? "";
      const upstream = await fetch(statusUrl, {
        method: "GET",
        headers: secret ? { "X-Opcache-Secret": secret } : {},
        signal: AbortSignal.timeout(5000),
      });

      if (!upstream.ok) {
        const msg = `PHP status endpoint returned HTTP ${upstream.status}.`;
        await supabase
          .from("php_opcode_cache_settings")
          .update({
            last_status_checked_at: now,
            last_status_result: "failed",
            last_status_message: msg,
            updated_at: now,
            updated_by: user.id,
          })
          .eq("id", true);

        return NextResponse.json({ result: "failed", message: msg, stats: null });
      }

      const stats = await upstream.json();

      await supabase
        .from("php_opcode_cache_settings")
        .update({
          last_status_checked_at: now,
          last_status_result: "success",
          last_status_message: null,
          updated_at: now,
          updated_by: user.id,
        })
        .eq("id", true);

      return NextResponse.json({ result: "success", message: null, stats });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Unexpected error contacting PHP status endpoint.";

      await supabase
        .from("php_opcode_cache_settings")
        .update({
          last_status_checked_at: now,
          last_status_result: "failed",
          last_status_message: msg,
          updated_at: now,
          updated_by: user.id,
        })
        .eq("id", true);

      return NextResponse.json({ result: "failed", message: msg, stats: null });
    }
  }

  // action === "reset"
  const resetUrl = process.env.OPCACHE_RESET_URL;

  if (!resetUrl) {
    return NextResponse.json({
      result: "unavailable",
      message:
        "OPCACHE_RESET_URL is not configured. " +
        "Add it to .env.local and deploy a PHP reset helper script.",
    });
  }

  try {
    const secret = process.env.OPCACHE_SECRET_HEADER ?? "";
    const upstream = await fetch(resetUrl, {
      method: "POST",
      headers: secret ? { "X-Opcache-Secret": secret } : {},
      signal: AbortSignal.timeout(5000),
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { result: "failed", message: `Reset endpoint returned HTTP ${upstream.status}.` },
        { status: 502 }
      );
    }

    await supabase
      .from("php_opcode_cache_settings")
      .update({
        last_reset_at: now,
        updated_at: now,
        updated_by: user.id,
      })
      .eq("id", true);

    return NextResponse.json({ result: "success", message: "OPcache reset successfully." });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Unexpected error calling PHP reset endpoint.";
    return NextResponse.json({ result: "failed", message: msg }, { status: 502 });
  }
}
