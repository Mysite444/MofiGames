import { NextResponse, type NextRequest } from "next/server";
import { publicClient } from "./supabase/route-auth";
import { hashApiKey, type ApiKeyScope } from "./api-keys";
import { checkRateLimit } from "./rate-limit";

interface ApiAuthOk {
  ok: true;
  keyId: string;
  label: string;
}
interface ApiAuthFail {
  ok: false;
  response: NextResponse;
}

/** Authenticates a /api/v1/* request against `Authorization: Bearer
 * <key>`, checks the required scope, and enforces that key's own
 * rate_limit_per_hour (see verify_api_key() / hit_rate_limit(),
 * migrations 0018 & 0019). Every route under /api/v1 should call this
 * first and bail out on `!result.ok`. */
export async function authenticateApiRequest(
  request: NextRequest,
  requiredScope: ApiKeyScope
): Promise<ApiAuthOk | ApiAuthFail> {
  const authHeader = request.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Missing API key. Send it as: Authorization: Bearer <key>" },
        { status: 401 }
      ),
    };
  }

  const supabase = await publicClient();
  const hash = hashApiKey(match[1].trim());

  const { data, error } = await supabase.rpc("verify_api_key", {
    p_key_hash: hash,
    p_scope: requiredScope,
  });
  if (error || !data?.valid) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid or expired API key." },
        { status: 401 }
      ),
    };
  }

  const underLimit = await checkRateLimit(
    supabase,
    `apikey:${data.keyId}`,
    3600,
    data.rateLimitPerHour ?? 1000
  );
  if (!underLimit) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Rate limit exceeded for this API key." },
        { status: 429 }
      ),
    };
  }

  return { ok: true, keyId: data.keyId, label: data.label };
}

/**
 * CORS response headers for a /api/v1/* response, driven by the
 * Admin → Security → Settings → api_cors_origins allowlist.
 *
 * Three possible outcomes, in order:
 *
 * 1. No Origin header in the request — the call is server-to-server
 *    (curl, backend, cron). Browsers always add Origin on cross-origin
 *    fetches; its absence proves the caller isn't a browser. Return {}
 *    so no CORS headers pollute server-to-server responses.
 *
 * 2. allowedOrigins contains '*' — admin has explicitly opted into a
 *    fully public API. Return Access-Control-Allow-Origin: * with NO
 *    Vary header. Vary: Origin is only meaningful when different origins
 *    receive *different* responses (so CDNs can store a copy per
 *    origin). With a wildcard every origin gets the identical response;
 *    adding Vary: Origin would unnecessarily fragment CDN caches for no
 *    security benefit. Note: '*' is incompatible with
 *    Access-Control-Allow-Credentials: true — credentials (cookies) are
 *    never sent to a wildcard endpoint, which is correct since /api/v1/*
 *    authenticates via Bearer token, not cookies.
 *
 * 3. allowedOrigins contains the exact request Origin — reflect that
 *    origin back rather than echoing '*'. This keeps the behaviour
 *    consistent if credentials are ever added, and it tells intermediate
 *    caches (Vary: Origin) to store separate response copies per origin
 *    so origin A's cached response is never served to origin B.
 *
 * 4. Origin is not in the allowlist — return {} (no ACAO header). The
 *    browser's own CORS policy then rejects the response read.
 *
 * The admin sets api_cors_origins from Admin → Security → Settings.
 * An empty list (the default) means /api/v1/* is only reachable by
 * server-side callers that don't send an Origin header. Add explicit
 * origins there before calling this API from a browser on another
 * domain. Avoid '*' unless the data is intentionally world-public.
 */
export function corsHeaders(
  request: NextRequest,
  allowedOrigins: string[]
): HeadersInit {
  const origin = request.headers.get("origin");

  // 1. Server-to-server — no Origin header, no CORS headers needed.
  if (!origin) return {};

  // 2. Wildcard — same response for every origin.
  //    No Vary: Origin because the response body never differs by origin.
  if (allowedOrigins.includes("*")) {
    return { "Access-Control-Allow-Origin": "*" };
  }

  // 3. Specific-origin allowlist match — reflect the exact origin and
  //    instruct caches to key on Origin so they don't mix up per-origin
  //    responses.
  if (allowedOrigins.includes(origin)) {
    return { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
  }

  // 4. Origin not in allowlist — no ACAO header; browser blocks the read.
  return {};
}
