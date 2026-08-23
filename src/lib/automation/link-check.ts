// Shared "is this URL actually reachable" check, used by every health-check
// executor (broken embed checker, dead link scanner, link validation).
// Mirrors the logic already proven out in
// /api/admin/analytics/content-health/check-links — HEAD first, GET as a
// fallback for servers that don't support HEAD, real timeout, real result.

const CHECK_TIMEOUT_MS = 6000;

export interface LinkCheckResult {
  ok: boolean;
  reason: string;
}

export async function checkLink(url: string): Promise<LinkCheckResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

  const attempt = (method: "HEAD" | "GET") =>
    fetch(url, {
      method,
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "MofiGames-Automation/1.0" },
    });

  try {
    let res: Response;
    try {
      res = await attempt("HEAD");
      if (res.status === 405 || res.status === 501) {
        res = await attempt("GET");
      }
    } catch {
      res = await attempt("GET");
    }
    clearTimeout(timeout);
    return res.ok ? { ok: true, reason: `${res.status} OK` } : { ok: false, reason: `HTTP ${res.status}` };
  } catch (err) {
    clearTimeout(timeout);
    const message = err instanceof Error && err.name === "AbortError" ? "Timed out" : "Unreachable";
    return { ok: false, reason: message };
  }
}

export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function runner() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return results;
}

/** Pulls http(s) URLs out of an href="..." attribute inside an HTML blob —
 * used by the Auto Link Validation job to check outbound links inside
 * Pages/Posts rich-text content without needing a full HTML parser. */
export function extractHrefLinks(html: string): string[] {
  const found = new Set<string>();
  const re = /href\s*=\s*["'](https?:\/\/[^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    found.add(match[1]);
  }
  return Array.from(found);
}
