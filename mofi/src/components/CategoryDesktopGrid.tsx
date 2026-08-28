"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { CategoryPageCard } from "./CategoryPageCard";
import type { Game } from "@/lib/types";

// 5 rows × 6 cols per "page" — matches CrazyGames' density on a genre page.
const PAGE_SIZE = 30;
// CrazyGames-style hard cap: a single category/collection page never shows
// more than this many thumbnails, no matter how big the underlying set is.
export const MAX_GAMES = 70;

export type SortMode = "top" | "new";

// Collapses a long page range into a compact list with "…" gaps — same
// logic as the mobile CategoryGrid, kept in sync intentionally. With the
// 70-game cap + 30-per-page, this maxes out at 3 pages, so the ellipsis
// path rarely fires here, but it's cheap insurance if PAGE_SIZE ever drops.
function getPageItems(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const items: (number | "ellipsis")[] = [1];
  if (current > 3) items.push("ellipsis");
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) items.push(i);
  if (current < total - 2) items.push("ellipsis");
  items.push(total);
  return items;
}

interface CategoryDesktopGridProps {
  /** Games ordered "most played first" — used as-is when no sort toggle is shown. */
  games: Game[];
  /** Games ordered "most recently added first". Pass this to enable the
   *  Top games / New games sort dropdown (CrazyGames genre-page feature).
   *  Omit it on pages where a Top/New split wouldn't make sense (Favorites,
   *  Recently Played) and the grid just renders `games` as given. */
  newGames?: Game[];
  /** Which sort tab reads as "active" on first render. */
  defaultSort?: SortMode;
}

export function CategoryDesktopGrid({ games, newGames, defaultSort = "top" }: CategoryDesktopGridProps) {
  const showSortMenu = Boolean(newGames && newGames.length > 0);
  const [sort, setSort] = useState<SortMode>(defaultSort);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [page, setPage] = useState(1);
  const topRef = useRef<HTMLDivElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setSortMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeList = sort === "new" && newGames ? newGames : games;
  const cappedGames = useMemo(() => activeList.slice(0, MAX_GAMES), [activeList]);

  const totalPages = Math.max(1, Math.ceil(cappedGames.length / PAGE_SIZE));
  const visible = cappedGames.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasMore = cappedGames.length > PAGE_SIZE;
  const pageItems = getPageItems(page, totalPages);

  function goToPage(p: number) {
    setPage(Math.min(Math.max(1, p), totalPages));
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleSortChange(next: SortMode) {
    setSort(next);
    setSortMenuOpen(false);
    setPage(1);
  }

  return (
    <div>
      {showSortMenu && (
        <div className="mb-4 flex justify-end">
          <div ref={sortMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setSortMenuOpen((o) => !o)}
              aria-expanded={sortMenuOpen}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-[var(--color-surface-2)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/25 hover:bg-white/[0.14]"
            >
              {sort === "top" ? "Top games" : "New games"}
              <ChevronDown
                size={16}
                strokeWidth={2.5}
                className={`transition-transform duration-150 ${sortMenuOpen ? "rotate-180" : ""}`}
              />
            </button>

            {sortMenuOpen && (
              <div className="glass-opaque absolute right-0 top-full z-20 mt-2 w-40 overflow-hidden rounded-xl py-1">
                <button
                  type="button"
                  onClick={() => handleSortChange("top")}
                  className={`block w-full px-4 py-2.5 text-left text-sm font-semibold transition-colors hover:bg-white/10 ${
                    sort === "top" ? "text-white" : "text-text-muted"
                  }`}
                >
                  Top games
                </button>
                <button
                  type="button"
                  onClick={() => handleSortChange("new")}
                  className={`block w-full px-4 py-2.5 text-left text-sm font-semibold transition-colors hover:bg-white/10 ${
                    sort === "new" ? "text-white" : "text-text-muted"
                  }`}
                >
                  New games
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6-column grid, 17px gap — measured pixel-for-pixel off CrazyGames' own
          /c/action genre page (17px both row-gap and column-gap there, not the
          10px this used to be). Thumbnails stay 16:9 via CategoryPageCard's
          aspect-video, so this larger gap is also what shrinks each tile down
          to CrazyGames' actual ~195px column width instead of ~202px. */}
      <div ref={topRef} className="grid grid-cols-6 gap-[17px]">
        {visible.map((game) => (
          <CategoryPageCard key={game.id} game={game} />
        ))}
      </div>

      {/* Pagination — always visible once there's more than one page. It used
          to be hidden behind a "Show more" click (setPaginationRevealed);
          that's gone now since gating it that way hid page-jump access on
          first load, which isn't how CrazyGames' own genre pages behave —
          their page-number bar sits directly under the grid, no click
          required to reveal it. */}
      {hasMore && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-1.5">
          {/* ← Prev */}
          <button
            type="button"
            onClick={() => goToPage(page - 1)}
            disabled={page === 1}
            aria-label="Previous page"
            className="pagination-arrow flex h-9 w-9 shrink-0 items-center justify-center rounded-full disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronLeft size={16} />
          </button>

          {pageItems.map((item, idx) =>
            item === "ellipsis" ? (
              <span
                key={`ellipsis-${idx}`}
                aria-hidden
                className="flex h-9 w-5 shrink-0 items-center justify-center text-sm text-text-faint"
              >
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => goToPage(item)}
                aria-current={item === page ? "page" : undefined}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                  item === page ? "pagination-btn-active" : "pagination-btn"
                }`}
              >
                {item}
              </button>
            )
          )}

          {/* → Next: always solid purple primary CTA */}
          <button
            type="button"
            onClick={() => goToPage(page + 1)}
            disabled={page === totalPages}
            aria-label="Next page"
            className="pagination-arrow-next flex h-9 w-9 shrink-0 items-center justify-center rounded-full disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
