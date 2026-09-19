import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { createTimeoutFetch } from "./timeout-fetch";

// Server-only. A plain, cookie-free Supabase client backed by the public
// anon key.
//
// WHY THIS EXISTS:
//   The cookie-based `createClient()` in ./server.ts calls `cookies()` from
//   next/headers on every invocation. Any code path that touches `cookies()`
//   is treated by Next.js as a dynamic function, which opts the *entire page*
//   into per-request server-side rendering — no static generation, no CDN
//   caching. For public, non-user-specific data (games catalogue, SEO
//   settings, site identity, fragment-cache settings, …) this is pure
//   overhead: those reads use the same anon key and the same RLS policy
//   regardless of who's asking.
//
//   Switching those reads to this client eliminates the unnecessary
//   cookies() call from their call stack, which in turn lets Next.js
//   statically pre-render (or ISR-cache) any page whose *only* dynamic
//   dependency was that cookie read.
//
// SAFETY:
//   Every table this client is used for has a "publicly readable" RLS
//   policy that allows anon SELECT unconditionally (confirmed in
//   migrations 0003, 0007, 0010, 0011, 0022, 0023, 0030, 0039, 0042b,
//   0049). Using the anon key without a session cookie is therefore
//   behaviourally identical to using the cookie-based client for an
//   unauthenticated visitor — which is what was already happening on
//   every anonymous page view.
//
//   Do NOT use this client for:
//     - auth.getUser() / session checks
//     - writes that need admin context
//     - any table where RLS requires a user session
//   Those must continue to go through ./server.ts (cookie-aware).
//
// SINGLETON:
//   The public client carries no per-request state (no session, no cookies),
//   so it's safe — and cheaper — to reuse the same instance across all
//   requests in the same Node process. The module-level variable below
//   ensures only one client is created per serverless instance.
//
// TYPING:
//   Typed as SupabaseClient<any> rather than ReturnType<typeof createClient>
//   — the generic type alias resolves cleanly in strict mode while the
//   ReturnType utility can leave type variables unresolved, causing TypeScript
//   to collapse query-result types to `never` in downstream files.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: SupabaseClient<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createPublicClient(): SupabaseClient<any> {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  _client = createSupabaseClient(url, key, {
    auth: { persistSession: false },
    global: { fetch: createTimeoutFetch() },
  });
  return _client;
}
