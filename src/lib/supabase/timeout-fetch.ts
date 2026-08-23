// Server-only. A drop-in replacement for global fetch, handed to Supabase
// clients via their `global.fetch` option (createServerClient /
// createClient both accept it).
//
// Why this exists: supabase-js's queries never time out on their own —
// they wait on whatever the underlying fetch() does, which by default is
// "however long the OS takes to give up" (often 60s+ on a hung
// connection). One slow/unreachable Supabase project can therefore hang
// every request that touches it for far longer than any user will wait,
// long after "the page just shows fallback content" would have been the
// better outcome. Wiring this into the client's fetch turns that into a
// bounded, predictable failure that the try/catch + static-fallback layer
// in games-server.ts / content-server.ts / etc. can react to quickly.
//
// AbortSignal.timeout() + AbortSignal.any() are both stable in the Node
// runtime this app targets (Node 20+/22+, see package.json engines via
// Next 16's own requirement) and in every evergreen browser, so no
// polyfill is needed even though this file is imported from code that
// (in theory) could run in more than one runtime.

export const DEFAULT_SUPABASE_TIMEOUT_MS = 8_000;

/**
 * Next.js uses thrown errors carrying a special `.digest` string as
 * internal control-flow signals — most relevantly here,
 * `DYNAMIC_SERVER_USAGE`, thrown when a build-time static-rendering
 * probe hits a dynamic API like `cookies()` (see
 * https://nextjs.org/docs/messages/dynamic-server-error). Next expects
 * that error to propagate all the way up so it can mark the route
 * dynamic and move on; it is NOT a real failure of whatever code was
 * running at the time.
 *
 * Every try/catch this app wraps around a Supabase call must check this
 * first and rethrow, unchecked — otherwise, during `next build`'s
 * "Collecting page data" phase, a route that legitimately depends on
 * cookies() (i.e. nearly every page here, since the Supabase client is
 * cookie-bound) trips this on every single data call, and a naive catch
 * block would misreport it as "Supabase is down, falling back to the
 * static snapshot" — which is misleading in build logs and, worse, is
 * not what should be recorded as the reason a route fell back. The
 * other Next.js control-flow digests (redirect(), notFound(),
 * unauthorized(), the various NEXT_HTTP_ERROR_FALLBACK cases) are
 * included too, for the same reason, even though none of the current
 * call sites are expected to trigger them — this is meant to be a
 * complete, reusable guard, not one hand-fit to today's call sites.
 */
export function isNextControlFlowError(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null | undefined)?.digest;
  if (typeof digest !== "string") return false;
  return (
    digest === "DYNAMIC_SERVER_USAGE" ||
    digest.startsWith("NEXT_REDIRECT") ||
    digest.startsWith("NEXT_NOT_FOUND") ||
    digest.startsWith("NEXT_HTTP_ERROR_FALLBACK")
  );
}

/** Builds a fetch function that aborts any request taking longer than
 * `timeoutMs`. If the caller already passed its own AbortSignal (rare for
 * supabase-js's internal calls, but not impossible), the two signals are
 * combined — whichever fires first wins — rather than one silently
 * overriding the other. */
export function createTimeoutFetch(timeoutMs: number = DEFAULT_SUPABASE_TIMEOUT_MS): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
    return fetch(input, { ...init, signal });
  };
}

/** Races an arbitrary promise (e.g. a supabase-js query builder, which is
 * thenable but not itself abortable) against a timeout. Complements
 * createTimeoutFetch above for the couple of call sites that build a
 * one-off client rather than going through server.ts — the query's
 * underlying HTTP request may still be in flight after this rejects, but
 * the caller is freed to fall back immediately instead of hanging. */
export function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}
