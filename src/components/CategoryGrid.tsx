"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { GameCard } from "./GameCard";
import type { Game } from "@/lib/types";

const PAGE_SIZE = 60;

// Collapses a long page range into a compact list with "…" gaps, e.g.
// [1, "ellipsis", 8, 9, 10, "ellipsis", 21]. Without this, pages like
// /latest-games (~1,260 games -> 21 pages) render 21+ number buttons in
// one unwrapping row, which overflows a mobile-width screen — that's the
// "pagination issue" on the mobile latest/popular/updated grids. Single
// category pages (~70 games -> 2 pages) never hit this since the count
// stays under the threshold below.
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

export function CategoryGrid({ games }: { games: Game[] }) {
  const [page, setPage] = useState(1);
  const topRef = useRef<HTMLDivElement>(null);

  const totalPages = Math.max(1, Math.ceil(games.length / PAGE_SIZE));
  const visible = games.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasMore = games.length > PAGE_SIZE;
  const pageItems = getPageItems(page, totalPages);

  function goToPage(p: number) {
    setPage(Math.min(Math.max(1, p), totalPages));
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div>
      <div ref={topRef} className="grid grid-cols-3 gap-2.5 px-4 md:grid-cols-4 md:gap-4 lg:grid-cols-5 xl:grid-cols-6">
        {visible.map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </div>

      {/* Pagination — always visible once there's more than one page, same
          as the desktop grid. It used to sit behind a "Show more" click
          that hid it on first load; removed so page-jump access isn't
          gated behind an extra tap. */}
      {hasMore && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5 px-4">
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
