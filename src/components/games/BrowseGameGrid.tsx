"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { BrowseGameCard } from "@/components/BrowseGameCard";
import { GameCard } from "@/components/GameCard";
import type { Game, Category } from "@/lib/types";

const PAGE_SIZE_DESKTOP = 24; // 4 rows of 6
const PAGE_SIZE_MOBILE = 24; // multiple of 3 and 4 columns

export function BrowseGameGrid({
  games,
  categories,
  variant,
}: {
  games: Game[];
  categories: Category[];
  variant: "desktop" | "mobile";
}) {
  const pageSize = variant === "desktop" ? PAGE_SIZE_DESKTOP : PAGE_SIZE_MOBILE;
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Whenever the underlying list changes identity (new filters/sort applied),
  // jump back to the first page rather than keeping a stale scroll depth.
  useEffect(() => {
    setVisibleCount(pageSize);
    setLoadingMore(false);
    loadingRef.current = false;
  }, [games, pageSize]);

  const hasMore = visibleCount < games.length;

  function loadMore() {
    // Ref guard (not state) so a rapid second IntersectionObserver fire —
    // or React StrictMode's dev-only double-invoke — can't schedule two
    // overlapping loads before the first re-render lands.
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoadingMore(true);
    window.setTimeout(() => {
      setVisibleCount((c) => Math.min(c + pageSize, games.length));
      setLoadingMore(false);
      loadingRef.current = false;
    }, 220);
  }

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "800px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, games.length, pageSize]);

  if (games.length === 0) return null;

  const visible = games.slice(0, visibleCount);

  return (
    <div>
      {variant === "desktop" ? (
        <div className="grid grid-cols-6 gap-x-[17px] gap-y-5">
          {visible.map((game) => {
            const category = categories.find((c) => c.slug === game.categorySlug);
            return <BrowseGameCard key={game.id} game={game} category={category} />;
          })}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2.5 px-4 md:grid-cols-4 md:gap-4">
          {visible.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      )}

      {hasMore && (
        <div ref={sentinelRef} className={`flex justify-center py-8 ${variant === "mobile" ? "px-4" : ""}`}>
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            style={{ touchAction: "manipulation" }}
            className="btn-cta flex items-center gap-2 px-6 py-2.5 text-sm disabled:opacity-70"
          >
            {loadingMore ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Loading…
              </>
            ) : (
              `Load More (${games.length - visibleCount} left)`
            )}
          </button>
        </div>
      )}
    </div>
  );
}
