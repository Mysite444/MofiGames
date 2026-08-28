"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Home, RotateCcw, AlertTriangle } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // In production, Next.js sanitises the error object before handing it
    // to this boundary — message is replaced with a generic string and
    // stack is removed — so console.error(error) would not expose
    // implementation details to the browser console in a production build.
    //
    // However, staging and preview environments often run production builds
    // with real data, and some error-monitoring SDKs (Sentry, Datadog RUM)
    // can also intercept console.error and forward the payload externally.
    //
    // Rule: send only the opaque digest to the console. The digest is the
    // correlation ID that maps to the full server-side error in your hosting
    // provider's log viewer. For richer client-side reporting, pass the
    // digest (and nothing else) to your error monitoring service here.
    //
    // TODO: replace this with your error monitoring SDK before launch.
    //   e.g. Sentry.captureException(error) — the SDK already scrubs stacks
    //   and PII before sending, and respects the user's consent preferences.
    if (process.env.NODE_ENV === "production") {
      console.error("Client error (ref:", error.digest ?? "none", ")");
    } else {
      // Development: full error is fine — no real data, useful for debugging.
      console.error(error);
    }
  }, [error]);

  return (
    <div className="flex flex-col gap-6 px-4 md:px-6">
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 py-10 text-center sm:py-16">
        <span className="glass-strong flex h-16 w-16 items-center justify-center rounded-2xl text-[var(--color-hot)] glow-sm">
          <AlertTriangle size={30} />
        </span>

        <div className="flex flex-col gap-2">
          <h1 className="font-display text-2xl font-bold text-white">Something went wrong</h1>
          <p className="text-sm text-text-faint">
            An unexpected error occurred while loading this page. You can try again, or head back
            to the home page.
          </p>
          {error.digest && (
            <p className="text-xs text-text-faint">Error reference: {error.digest}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="glow-yellow-button inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-menu-bg)] px-6 py-2.5 text-sm font-bold text-white active:scale-[0.98]"
          >
            <RotateCcw size={18} strokeWidth={2.5} />
            Try Again
          </button>
          <Link
            href="/"
            className="glass-strong inline-flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold text-white transition-transform active:scale-[0.98]"
          >
            <Home size={18} strokeWidth={2.5} />
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
