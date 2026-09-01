"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Star, Trash2 } from "lucide-react";
import { VerifiedBadge } from "./VerifiedBadge";
import { Avatar } from "./Avatar";
import { useAuth } from "@/lib/auth-context";
import {
  submitReview,
  deleteReview,
  useGameReviews,
  useReviewPostError,
  clearReviewPostError,
  type Review,
} from "@/lib/reviews";
import type { Game } from "@/lib/types";

const PAGE_SIZE = 8;

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} aria-label={`${n} star${n === 1 ? "" : "s"}`} className="p-0.5">
          <Star size={20} className={n <= value ? "fill-gold text-gold" : "text-white/25"} />
        </button>
      ))}
    </div>
  );
}

function StarRow({ rating, size = 13 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} className={n <= rating ? "fill-gold text-gold" : "text-white/20"} />
      ))}
    </div>
  );
}

/**
 * Public 1-5 star reviews for a single game — one review per signed-in
 * user, editable/deletable by its own author, everyone else's read-only.
 * Separate from the quick star-only rating widget elsewhere on the page
 * (game_ratings, private/self-only, see GameDetailsSection) — reviews are
 * meant to be publicly readable, like comments, and pair a rating with a
 * short write-up. Server-backed via lib/reviews.ts (see
 * src/app/api/games/[slug]/reviews). Review text is always rendered as a
 * plain React text node, never raw HTML — see src/lib/sanitize-text.ts
 * for the server-side sanitization applied on top of that.
 */
export function ReviewsSection({ game }: { game: Game }) {
  const { user, ready } = useAuth();
  const reviews = useGameReviews(game.slug);
  const postError = useReviewPostError(game.slug);

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [draftRating, setDraftRating] = useState(0);
  const [draftText, setDraftText] = useState("");
  const [editing, setEditing] = useState(false);

  const myReview = useMemo(
    () => (user ? reviews.find((r) => r.authorId === user.id) ?? null : null),
    [reviews, user]
  );
  const others = useMemo(
    () =>
      reviews
        .filter((r) => r.authorId !== user?.id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [reviews, user]
  );
  const average = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;

  const visible = others.slice(0, visibleCount);
  const hasMore = others.length > visible.length;

  function startEditing() {
    setDraftRating(myReview?.rating ?? 0);
    setDraftText(myReview?.text ?? "");
    setEditing(true);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user || draftRating < 1 || !draftText.trim()) return;
    submitReview(game.slug, user.id, user.name, draftRating, draftText, user.isAdmin);
    setEditing(false);
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-text sm:text-xl">
          <Star size={18} />
          Reviews
          <span className="text-text-faint">({reviews.length})</span>
        </h2>
        {reviews.length > 0 && (
          <div className="flex items-center gap-1.5 text-sm font-semibold text-text-muted">
            <Star size={15} className="fill-gold text-gold" />
            {average.toFixed(1)}
          </div>
        )}
      </div>

      {ready && user && !editing && (
        <button
          type="button"
          onClick={startEditing}
          className="glass flex items-center gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-white/5"
        >
          <Avatar name={user.name} size={36} />
          <span className="text-sm text-text-faint">
            {myReview ? "Edit your review…" : `Write a review as ${user.name}…`}
          </span>
        </button>
      )}

      {ready && user && editing && (
        <form onSubmit={handleSubmit} className="flex items-start gap-3">
          <Avatar name={user.name} size={36} />
          <div className="glass input-glow flex flex-1 flex-col gap-2.5 rounded-2xl p-3">
            <StarPicker value={draftRating} onChange={setDraftRating} />
            <textarea
              autoFocus
              value={draftText}
              onChange={(e) => {
                setDraftText(e.target.value);
                if (postError) clearReviewPostError(game.slug);
              }}
              placeholder={`What did you think of ${game.title}?`}
              rows={3}
              maxLength={1000}
              className="w-full resize-none bg-transparent text-sm text-white placeholder:text-text-faint focus:outline-none"
            />
            {postError && <p className="text-xs font-medium text-hot">{postError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-text-faint hover:text-text"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={draftRating < 1 || !draftText.trim()}
                className="glow-yellow-button inline-flex items-center justify-center rounded-full bg-[var(--color-menu-bg)] px-5 py-2 text-xs font-bold text-white transition-opacity disabled:pointer-events-none disabled:opacity-40"
              >
                {myReview ? "Update" : "Post"}
              </button>
            </div>
          </div>
        </form>
      )}

      {ready && !user && (
        <div className="glass flex items-center justify-between gap-3 rounded-2xl p-4 text-sm">
          <span className="text-text-muted">Log in to leave a review.</span>
          <Link href="/login" className="glass-strong shrink-0 rounded-full px-4 py-2 text-xs font-bold text-white">
            Log In
          </Link>
        </div>
      )}

      {myReview && !editing && (
        <ReviewRow review={myReview} isOwn onDelete={() => user && deleteReview(game.slug, user.id)} />
      )}

      {reviews.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-faint">No reviews yet — be the first to share what you think.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {visible.map((r) => (
            <ReviewRow key={r.id} review={r} isOwn={false} />
          ))}
        </div>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
          className="glass mx-auto rounded-full px-5 py-2 text-xs font-semibold text-text-muted hover:text-text"
        >
          Show more reviews
        </button>
      )}
    </section>
  );
}

function ReviewRow({ review, isOwn, onDelete }: { review: Review; isOwn: boolean; onDelete?: () => void }) {
  return (
    <div className="flex items-start gap-3">
      <Avatar name={review.authorName} size={36} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="inline-flex items-center gap-1 font-semibold text-text">
            {review.authorName}
            {review.authorIsAdmin && <VerifiedBadge size={14} className="translate-y-[1px]" />}
          </span>
          <StarRow rating={review.rating} />
          <span className="text-xs text-text-faint">{timeAgo(review.updatedAt)}</span>
        </div>
        {/* Rendered as a plain text node — React escapes it. See
            src/lib/sanitize-text.ts for the server-side sanitization
            applied before this was ever stored. */}
        <p className="whitespace-pre-wrap break-words text-sm text-text-muted">{review.text}</p>
        {isOwn && onDelete && (
          <div className="mt-0.5 flex items-center gap-4 text-xs font-semibold text-text-faint">
            <button type="button" onClick={onDelete} className="flex items-center gap-1.5 hover:text-hot">
              <Trash2 size={13} />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
