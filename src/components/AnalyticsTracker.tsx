"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { getOrCreateVisitorId } from "@/lib/visitor-id";

/** Renders nothing. Logs one page view (POST /api/analytics/pageview) on
 * mount and on every route change, everywhere except the admin panel
 * itself (an admin browsing their own dashboard shouldn't inflate their
 * own visitor stats). Fails soft — a dropped analytics beacon should
 * never surface as a user-facing error or block navigation. */
export function AnalyticsTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) return;

    const query = searchParams?.toString();
    const path = query ? `${pathname}?${query}` : pathname;

    try {
      const visitorId = getOrCreateVisitorId();
      fetch("/api/analytics/pageview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          path,
          referrer: document.referrer || "",
          visitorId,
        }),
      }).catch(() => {});
    } catch {
      // best-effort — never let a tracking failure affect the page
    }
  }, [pathname, searchParams]);

  return null;
}
