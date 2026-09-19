import Link from "next/link";
import { Home, Ghost } from "lucide-react";
import { SearchBox } from "@/components/SearchBox";
import { RandomGameButton } from "@/components/RandomGameButton";
import { CategoryQuickLinks } from "@/components/CategoryQuickLinks";

export const metadata = { title: "Page Not Found — MofiGames" };

export default function NotFound() {
  return (
    <div className="flex flex-col gap-8 px-4 md:px-6">
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 py-6 text-center sm:py-10">
        <span className="glass-strong flex h-16 w-16 items-center justify-center rounded-2xl text-white glow-sm">
          <Ghost size={30} />
        </span>

        <div className="flex flex-col gap-2">
          <p className="font-display text-6xl font-bold tracking-tight text-white glow-text sm:text-7xl">
            404
          </p>
          <h1 className="font-display text-xl font-bold text-white sm:text-2xl">
            This page wandered off
          </h1>
          <p className="text-sm text-text-faint">
            We couldn&apos;t find the page you were looking for. It may have been moved, renamed,
            or never existed.
          </p>
        </div>

        <SearchBox className="w-full max-w-sm" />

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="glass-strong inline-flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold text-white transition-transform active:scale-[0.98]"
          >
            <Home size={18} strokeWidth={2.5} />
            Back to Home
          </Link>
          <RandomGameButton />
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
        <p className="text-center text-xs font-semibold uppercase tracking-wide text-text-faint">
          Or browse a category
        </p>
        <CategoryQuickLinks />
      </div>
    </div>
  );
}
