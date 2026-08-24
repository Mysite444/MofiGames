"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Same logging discipline as error.tsx: in production, emit only the
    // opaque digest so browser DevTools never shows internal error details.
    // See error.tsx for the full rationale and the TODO for hooking up a
    // proper error monitoring SDK (Sentry, Datadog RUM, etc.).
    if (process.env.NODE_ENV === "production") {
      console.error("Global client error (ref:", error.digest ?? "none", ")");
    } else {
      console.error(error);
    }
  }, [error]);

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
          <span className="glass-strong flex h-16 w-16 items-center justify-center rounded-2xl text-[var(--color-hot)] glow-sm">
            <AlertTriangle size={30} />
          </span>

          <div className="flex flex-col gap-2">
            <h1 className="font-display text-2xl font-bold text-white">
              MofiGames hit a snag
            </h1>
            <p className="max-w-sm text-sm text-text-faint">
              A critical error stopped the app from loading. Try again, or come back in a
              moment.
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
              Try Again
            </button>
            <a
              href="/"
              className="glass-strong inline-flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold text-white transition-transform active:scale-[0.98]"
            >
              Back to Home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
