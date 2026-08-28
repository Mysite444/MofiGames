"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Search, Star, Trash2 } from "lucide-react";
import {
  deleteReviewAdmin,
  fetchReviewsAdmin,
  type AdminReview,
} from "@/lib/supabase/admin-content";

const PAGE_SIZE = 50;

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

function StarDisplay({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={12}
          className={n <= rating ? "fill-gold text-gold" : "text-white/20"}
        />
      ))}
    </span>
  );
}

/**
 * Moderation view: every review across every game, newest first. Supports
 * a game-slug filter, free-text search (review body or author name), a
 * star-rating range filter, and pagination. Delete goes through
 * DELETE /api/admin/reviews/:id (admin-only route).
 */
export function ReviewsAdminClient() {
  const [reviews, setReviews] = useState<AdminReview[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [gameSlug, setGameSlug] = useState("");
  const [q, setQ] = useState("");
  const [minRating, setMinRating] = useState("");
  const [maxRating, setMaxRating] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(
    async (
      nextPage: number,
      nextGameSlug: string,
      nextQ: string,
      nextMin: string,
      nextMax: string
    ) => {
      setLoadError(null);
      try {
        const result = await fetchReviewsAdmin({
          page: nextPage,
          gameSlug: nextGameSlug.trim() || undefined,
          q: nextQ.trim() || undefined,
          minRating: nextMin ? Number(nextMin) : undefined,
          maxRating: nextMax ? Number(nextMax) : undefined,
        });
        setReviews(result.reviews);
        setTotal(result.total);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Failed to load reviews.");
      }
    },
    []
  );

  useEffect(() => {
    load(page, gameSlug, q, minRating, maxRating);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    load(1, gameSlug, q, minRating, maxRating);
  }

  async function handleDelete(review: AdminReview) {
    if (!confirm(`Delete this review by ${review.authorName}? This can't be undone.`)) return;
    setDeletingId(review.id);
    try {
      await deleteReviewAdmin(review.id);
      await load(page, gameSlug, q, minRating, maxRating);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to delete review.");
    } finally {
      setDeletingId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Reviews</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            {reviews ? `${total} review${total === 1 ? "" : "s"}` : "Loading…"}
          </p>
        </div>

        <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-2">
          <input
            value={gameSlug}
            onChange={(e) => setGameSlug(e.target.value)}
            placeholder="Filter by game slug…"
            className="admin-input w-40"
          />
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-faint"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search reviews…"
              className="admin-input w-52 pl-8"
            />
          </div>
          {/* Star-rating range filter */}
          <div className="flex items-center gap-1.5 text-xs text-text-faint">
            <Star size={12} className="shrink-0" />
            <select
              value={minRating}
              onChange={(e) => setMinRating(e.target.value)}
              className="admin-input w-20 py-1.5"
            >
              <option value="">Min</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}★
                </option>
              ))}
            </select>
            <span>–</span>
            <select
              value={maxRating}
              onChange={(e) => setMaxRating(e.target.value)}
              className="admin-input w-20 py-1.5"
            >
              <option value="">Max</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}★
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="glass rounded-full px-4 py-2 text-xs font-semibold text-white/80 hover:text-white"
          >
            Search
          </button>
        </form>
      </div>

      {loadError && (
        <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">
          {loadError}
        </div>
      )}

      <div className="glass overflow-hidden rounded-xl">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-surface-border)]">
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-text-faint">
                Game
              </th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-text-faint">
                Author
              </th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-text-faint">
                Rating
              </th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-text-faint">
                Review
              </th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-text-faint">
                Date
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {reviews === null && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-text-faint">
                  <Loader2 size={18} className="mx-auto animate-spin" />
                </td>
              </tr>
            )}
            {reviews?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-text-faint">
                  No reviews found.
                </td>
              </tr>
            )}
            {reviews?.map((r) => (
              <tr
                key={r.id}
                className="border-b border-[var(--color-surface-border)] last:border-0 hover:bg-white/[0.03]"
              >
                <td className="px-4 py-3">
                  <span className="text-white/80">/{r.gameSlug}</span>
                  {r.gameTitle && (
                    <span className="block text-[11px] text-text-faint">{r.gameTitle}</span>
                  )}
                </td>
                <td className="px-4 py-3 font-semibold text-white">{r.authorName}</td>
                <td className="px-4 py-3">
                  <StarDisplay rating={r.rating} />
                </td>
                <td className="max-w-xs px-4 py-3 text-white/80">
                  <span className="line-clamp-2 break-words">{r.reviewText}</span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-text-faint">
                  {timeAgo(r.createdAt)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => handleDelete(r)}
                      disabled={deletingId === r.id}
                      aria-label={`Delete review by ${r.authorName}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-hot/15 hover:text-hot disabled:opacity-50"
                    >
                      {deletingId === r.id ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <Trash2 size={15} />
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm text-text-faint">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="glass rounded-full px-4 py-2 font-semibold text-white/80 hover:text-white disabled:opacity-40"
          >
            Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="glass rounded-full px-4 py-2 font-semibold text-white/80 hover:text-white disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
