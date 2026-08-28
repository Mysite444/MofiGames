"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { submitGameRating, fetchMyGameRating } from "@/lib/supabase/ratings";

/** Lets a signed-in visitor rate a game 1-5 stars. The displayed average
 * (`rating`/`ratingCount`) is the database-maintained aggregate — this
 * component only ever submits one user's vote and reflects the fresh
 * totals the API hands back, it never computes the average itself. */
export function RatingStars({
  slug,
  rating,
  ratingCount,
}: {
  slug: string;
  rating: number;
  ratingCount: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [myRating, setMyRating] = useState<number | null>(null);
  const [liveRating, setLiveRating] = useState(rating);
  const [liveCount, setLiveCount] = useState(ratingCount);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMyGameRating(slug).then(setMyRating);
  }, [slug]);

  async function rate(value: number) {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const previous = myRating;
    setMyRating(value);
    try {
      const result = await submitGameRating(slug, value);
      setLiveRating(result.rating);
      setLiveCount(result.ratingCount);
    } catch (err) {
      setMyRating(previous);
      setError(err instanceof Error ? err.message : "Sign in to rate this game.");
    } finally {
      setSubmitting(false);
    }
  }

  const display = hovered ?? myRating ?? 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-0.5" onMouseLeave={() => setHovered(null)}>
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              aria-label={`Rate ${value} star${value === 1 ? "" : "s"}`}
              onMouseEnter={() => setHovered(value)}
              onClick={() => rate(value)}
              className="p-0.5"
            >
              <Star
                size={18}
                className={value <= display ? "fill-gold text-gold" : "text-text-faint"}
              />
            </button>
          ))}
        </div>
        <span className="text-sm text-text-muted">
          <span className="font-bold text-text">{liveRating.toFixed(1)}</span> ({liveCount.toLocaleString()}{" "}
          rating{liveCount === 1 ? "" : "s"})
        </span>
      </div>
      {error && <p className="text-xs text-hot">{error}</p>}
    </div>
  );
}
