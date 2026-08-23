/**
 * Temporary, opt-in request-timing instrumentation for the homepage TTFB
 * audit (see MOFIGAMES_PERFORMANCE_AUDIT.md, Step 11).
 *
 * OFF by default — `timed()` is a no-op unless PERF_DEBUG_TTFB=1 is set
 * in the environment, so this is safe to ship without spamming
 * production logs, and cheap to turn on for a single deployment to
 * capture real numbers.
 *
 * To use:
 *   1. Set PERF_DEBUG_TTFB=1 on a Vercel Preview deployment (not
 *      Production — this is diagnostic, not something to run at scale).
 *   2. Load the homepage a few times.
 *   3. Read the timings from that deployment's Function Logs (Vercel
 *      dashboard → your project → Logs, or `vercel logs <url>`).
 *   4. Unset PERF_DEBUG_TTFB when done.
 *
 * This file and its call sites in src/app/page.tsx can be deleted at any
 * time without affecting behavior — it only ever wraps an existing
 * await, never changes what's awaited.
 */
const ENABLED = process.env.PERF_DEBUG_TTFB === "1";

export async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!ENABLED) return fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    console.log(`[perf] ${label}: ${(performance.now() - start).toFixed(1)}ms`);
  }
}
