import { NextResponse } from "next/server";

/**
 * Central error-response helper for all API route handlers.
 *
 * The rule: every error that originates inside the server (database, third-
 * party SDK, thrown exception) must be logged here on the server and must
 * NOT be forwarded to the HTTP response body. Raw error messages can contain:
 *   • SQL constraint names, table names, column names
 *   • File system paths (e.g. "ENOENT: no such file or directory, open '/app/…'")
 *   • Stack traces with internal function names and line numbers
 *   • Connection strings, environment variable names, library internals
 *
 * Instead: log the real error to stdout (visible in Vercel / Railway / your
 * hosting provider's log viewer, never in any HTTP response), and send the
 * caller a safe, opaque user message.
 *
 * ─── Usage ────────────────────────────────────────────────────────────────
 *
 *  // Supabase / PostgREST errors
 *  const { data, error } = await supabase.from("games").select("*");
 *  if (error) return apiError(error);
 *  if (error) return apiError(error, "Could not load games.");
 *
 *  // Caught exceptions (try / catch)
 *  } catch (err) {
 *    return apiError(err, "Import failed.");
 *  }
 *
 *  // Custom status (e.g. 502 Bad Gateway from an upstream call)
 *  return apiError(fetchErr, "Upstream service unavailable.", 502);
 *
 * ─── What NOT to do ───────────────────────────────────────────────────────
 *
 *  ✗ return NextResponse.json({ error: error.message }, { status: 500 });
 *  ✗ return NextResponse.json({ error: err instanceof Error ? err.message : "…" }, …);
 *  ✗ return NextResponse.json({ error: `Failed: ${someError.message}` }, …);
 *
 * ─── What IS safe to forward ──────────────────────────────────────────────
 *
 *  ✓ auth.message  — hardcoded strings from src/lib/supabase/route-auth.ts
 *  ✓ firstIssueMessage(zodError)  — Zod validation feedback about user input
 *  ✓ Hardcoded strings you wrote yourself that describe the action, not the failure
 *
 * ─── Server-side monitoring ───────────────────────────────────────────────
 *
 *  TODO: before launch, replace or supplement the console.error calls with
 *  your error monitoring SDK (Sentry, Datadog APM, Highlight, etc.) so
 *  errors are captured with context, grouped, and alerted on — rather than
 *  buried in raw log output. Pass `internalError` to the SDK as-is; it
 *  already scrubs sensitive fields before sending.
 */
export function apiError(
  internalError: unknown,
  userMessage = "Internal server error.",
  status = 500
): NextResponse {
  // Server-only: the real error (including message, code, stack, SQL detail)
  // appears in your hosting provider's log stream and never in any HTTP
  // response body. Cross-reference with the status + userMessage in the
  // access log to find the matching log line when debugging.
  console.error(`[api] ${userMessage}`, internalError);

  return NextResponse.json({ error: userMessage }, { status });
}
