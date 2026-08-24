"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, X, ArrowRight } from "lucide-react";
import { useMergedGames } from "@/lib/games-merged";
import { searchGamesByTitle } from "@/lib/game-filters";
import { GameThumbnail } from "./GameThumbnail";

export function SearchBox({
  className = "",
  autoFocus = false,
  onNavigate,
}: {
  className?: string;
  autoFocus?: boolean;
  onNavigate?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { games: allGames, categories: allCategories } = useMergedGames();
  const router = useRouter();

  function goToAllResults() {
    const q = query.trim();
    if (!q) return;
    setOpen(false);
    onNavigate?.();
    router.push(`/games?q=${encodeURIComponent(q)}`);
  }

  // Rotating typewriter placeholder — types out each phrase, holds, deletes,
  // then moves to the next. Only runs while the box is empty; once the
  // person starts typing their own query takes over and the loop stops.
  const [placeholder, setPlaceholder] = useState("Search games...");
  useEffect(() => {
    if (query.length > 0) return;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      const staticTimeout = setTimeout(
        () => setPlaceholder("Search games and categories..."),
        0
      );
      return () => clearTimeout(staticTimeout);
    }

    const phrases = [
      "Search games...",
      "Search racing games...",
      "Search puzzle games...",
      "Search action games...",
      "Search multiplayer games...",
    ];
    let phraseIndex = 0;
    let charIndex = 0;
    let deleting = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    function tick() {
      const current = phrases[phraseIndex];
      if (!deleting) {
        charIndex += 1;
        setPlaceholder(current.slice(0, charIndex));
        if (charIndex === current.length) {
          deleting = true;
          timeoutId = setTimeout(tick, 1400);
          return;
        }
        timeoutId = setTimeout(tick, 55);
      } else {
        charIndex -= 1;
        setPlaceholder(current.slice(0, charIndex));
        if (charIndex === 0) {
          deleting = false;
          phraseIndex = (phraseIndex + 1) % phrases.length;
          timeoutId = setTimeout(tick, 300);
          return;
        }
        timeoutId = setTimeout(tick, 30);
      }
    }

    timeoutId = setTimeout(tick, 400);
    return () => clearTimeout(timeoutId);
  }, [query.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const trimmed = query.trim().toLowerCase();
  const results = searchGamesByTitle(allGames, trimmed).slice(0, 6);

  // Log the search for Search Analytics (Admin → Analytics), debounced so
  // we log the settled query, not every keystroke. Fails soft — a dropped
  // log entry never affects the actual search experience.
  useEffect(() => {
    if (trimmed.length < 2) return;
    const timeout = setTimeout(() => {
      fetch("/api/analytics/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, resultsCount: results.length }),
      }).catch(() => {});
    }, 700);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed]);


  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="glass search-shell flex items-center gap-2 rounded-full px-3.5 py-2">
        <Search size={16} className="shrink-0 text-text-faint lg:text-white" />
        <input
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") goToAllResults();
          }}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm text-text placeholder:text-text-faint focus:outline-none lg:placeholder:text-white/80"
        />
        {query.length > 0 && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery("")}
            className="shrink-0 text-text-faint hover:text-text"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {open && trimmed.length > 0 && (
        <div className="glass-opaque absolute left-0 right-0 top-[calc(100%+8px)] z-50 max-h-[70vh] overflow-y-auto rounded-xl">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-text-faint">No games found for &ldquo;{query}&rdquo;</p>
          ) : (
            results.map((g) => {
              const category = allCategories.find((c) => c.slug === g.categorySlug);
              if (!g.thumbnailUrl && !category) return null;
              return (
                <Link
                  key={g.id}
                  href={`/${g.slug}`}
                  onClick={() => {
                    setOpen(false);
                    setQuery("");
                    onNavigate?.();
                  }}
                  className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-white/10"
                >
                  {g.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={g.thumbnailUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <GameThumbnail
                      category={category!}
                      variant={g.variant}
                      className="h-10 w-10 shrink-0 rounded-lg"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text">{g.title}</p>
                    <p className="text-xs text-text-faint">{category?.name}</p>
                  </div>
                </Link>
              );
            })
          )}
          <button
            type="button"
            onClick={goToAllResults}
            className="flex w-full items-center justify-between gap-2 border-t border-white/10 px-4 py-2.5 text-left text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            View all results for &ldquo;{query.trim()}&rdquo;
            <ArrowRight size={15} strokeWidth={2.5} />
          </button>
        </div>
      )}
    </div>
  );
}
