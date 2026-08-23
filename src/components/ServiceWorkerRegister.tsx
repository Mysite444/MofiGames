"use client";

import { useEffect } from "react";

/** Renders nothing. Registers /sw.js on mount, on every route (including
 * /admin — the worker itself ignores /admin and /api requests, so there's
 * no need to duplicate that logic here by conditionally skipping
 * registration by path).
 *
 * Registration always happens, whether or not caching is currently
 * turned on in Admin → Cache → Browser Cache: the route handler
 * (src/app/sw.js/route.ts) is the single source of truth for what the
 * worker actually does, and serves a self-unregistering "kill switch"
 * worker when the setting is off. That keeps this component dumb and
 * avoids a race between "fetch the setting" and "decide whether to
 * register" on every page load. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration can fail for reasons that shouldn't interrupt the
      // page (insecure context in local dev over plain HTTP, browser
      // policy, etc.) — this is a progressive enhancement, not a
      // requirement.
    });
  }, []);

  return null;
}
